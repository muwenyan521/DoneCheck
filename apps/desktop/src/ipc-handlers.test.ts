import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateObjectInput, GenerateObjectResult, LLMProvider } from "@donecheck/core";
import type { JudgementReport } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import {
  createBundledFreeQuotaStore,
  createBundledFreeWorkflowManager,
} from "./bundled-free-quota.js";
import { createSessionCredentialStore } from "./desktop-provider.js";
import { createHistoryStore } from "./history-store.js";
import { createDesktopIpcHandlers } from "./ipc-handlers.js";
import { createSettingsStore } from "./settings-store.js";

const externalResourceMatchers = [
  /<script\b/iu,
  /<link\s+[^>]*rel=["']stylesheet["'][^>]*>/iu,
  /\b(?:href|src)=["']https?:\/\//iu,
  /url\(\s*["']?https?:\/\//iu,
] as const;

const realPipelineProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: {
          candidateFiles: ["src/login.ts"],
          confidence: 0.95,
          reasoningSummary: "login implementation referenced by requirement and claim",
          warnings: [],
        } as unknown as T,
        metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
        usage: {},
      };
    }
    return {
      object: {
        confidence: 0.8,
        evidenceRefs: [
          {
            filePath: "src/login.ts",
            lineStart: 1,
            lineEnd: 1,
            snippetSummary: "login function persists a session token",
          },
        ],
        explanation: "localStorage call provides evidence for session persistence",
        judgementDraft: "fulfilled",
        matchedRequirementId: "REQ-1",
        repairSuggestion: "keep test coverage for login persistence",
      } as unknown as T,
      metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
      usage: {},
    };
  },
};

const semanticFailureProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: input.schema.parse({ candidateFiles: ["src/login.ts"] }) as T,
        metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
        usage: {},
      };
    }
    throw new Error(
      "502 Upstream request failed Authorization: Bearer test-secret-value https://service.test/v1?token=query-secret",
    );
  },
};

const codedSemanticFailureProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: input.schema.parse({ candidateFiles: ["src/login.ts"] }) as T,
        metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
        usage: {},
      };
    }
    throw Object.assign(
      new Error(
        "502 Upstream request failed Authorization: Bearer coded-secret https://service.test/v1?token=coded-query-secret",
      ),
      { code: "invalid-input" },
    );
  },
};

async function createWorkspace(): Promise<string> {
  const workspaceDir = join(tmpdir(), `donecheck-desktop-ipc-${crypto.randomUUID()}`);
  await mkdir(join(workspaceDir, "src"), { recursive: true });
  await writeFile(
    join(workspaceDir, "src", "login.ts"),
    "export function login() { localStorage.setItem('session', 'ok'); return 'implemented'; }\n",
  );
  return workspaceDir;
}

describe("desktop IPC handlers", () => {
  it("copies only the supplied repair prompt text through the injected clipboard capability", async () => {
    const copied: string[] = [];
    const handlers = createDesktopIpcHandlers({
      writeClipboardText: (text) => copied.push(text),
    });

    await expect(
      handlers.copyRepairPrompt({ text: "Repair exactly this report field." }),
    ).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(copied).toEqual(["Repair exactly this report field."]);
  });

  it("rejects empty clipboard requests and does not require Electron in the handler layer", async () => {
    const writeClipboardText = () => {
      throw new Error("must not be called");
    };
    const handlers = createDesktopIpcHandlers({ writeClipboardText });

    await expect(handlers.copyRepairPrompt({ text: "   " })).resolves.toEqual({
      ok: false,
      error: { code: "invalid-input", message: "repair prompt text is required" },
    });
  });

  it("analyze calls the real core pipeline and returns a judgement report", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const result = await handlers.analyze({
      requestId: "real-pipeline-analysis",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
      claim: "The login function stores a session token in localStorage.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.version).toBe("rules-v1");
    expect(result.data.generatedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(Array.isArray(result.data.judgements)).toBe(true);
    expect(result.data.judgements.length).toBeGreaterThan(0);
    expect(result.data.judgements[0]).toEqual(
      expect.objectContaining({
        finalStatus: expect.any(String),
        kind: expect.any(String),
        reasonCode: expect.any(String),
        signals: expect.any(Object),
        sourceId: expect.any(String),
      }),
    );
    const targetJudgement = result.data.judgements.find((judgement) =>
      judgement.signals.staticSignals.some(
        (signal) => signal.filePath === "src/login.ts" && signal.keyword === "localStorage",
      ),
    );
    expect(targetJudgement).toBeDefined();
    if (targetJudgement === undefined) throw new Error("missing target judgement");
    expect(targetJudgement.signals.staticSignals.length).toBeGreaterThan(0);
    expect(targetJudgement.signals.staticSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/login.ts", keyword: "localStorage" }),
      ]),
    );
    expect(targetJudgement.evidenceRefs).toEqual(
      expect.arrayContaining([expect.objectContaining({ filePath: "src/login.ts" })]),
    );
    for (const signal of targetJudgement.signals.staticSignals) {
      expect(
        signal.filePath === targetJudgement.sourceId ||
          targetJudgement.evidenceRefs.some((ref) => ref.filePath === signal.filePath),
      ).toBe(true);
    }
  });

  it("returns a provider error when semantic judgement fails", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => semanticFailureProvider });

    await expect(
      handlers.analyze({
        requestId: "semantic-provider-failure",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider-error",
        message: "Online analysis could not be completed.",
        providerErrorKind: "service-unavailable",
      },
    });
  });

  it("does not expose provider diagnostics through IPC", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => semanticFailureProvider });

    const result = await handlers.analyze({
      requestId: "semantic-provider-secret",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected provider failure");
    const serializedError = JSON.stringify(result.error);
    expect(serializedError).not.toMatch(/test-secret-value|query-secret|https?:\/\//iu);
  });

  it("does not trust provider-supplied error codes when serializing analysis failures", async () => {
    const handlers = createDesktopIpcHandlers({
      providerFactory: () => codedSemanticFailureProvider,
    });

    const result = await handlers.analyze({
      requestId: "semantic-provider-coded-secret",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "provider-error",
        message: "Online analysis could not be completed.",
        providerErrorKind: "service-unavailable",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/coded-secret|coded-query-secret|https?:\/\//iu);
  });

  it("returns a safe non-provider error for other desktop operation failures", async () => {
    const handlers = createDesktopIpcHandlers({
      selectDirectory: async () => {
        throw new Error(
          "desktop failure Authorization: Bearer test-secret-value https://service.test/desktop",
        );
      },
    });

    await expect(handlers.selectWorkspace()).resolves.toEqual({
      ok: false,
      error: {
        code: "unknown",
        message: "The requested operation could not be completed.",
      },
    });
  });

  it("renderHtml returns a self-contained report document for a real report", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
      requestId: "self-contained-report",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
      claim: "The login function stores a session token in localStorage.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });
    if (!analyzed.ok) throw new Error(analyzed.error.message);

    const html = await handlers.renderHtml({ report: analyzed.data });

    expect(html.ok).toBe(true);
    if (!html.ok) throw new Error(html.error.message);
    expect(html.data.html).toMatch(/^<!doctype html><html lang="zh-CN">/u);
    expect(html.data.html).toContain("DoneCheck");
    expect(html.data.html).toContain("检查结果");
    expect(html.data.html).toContain('<style data-donecheck-report-styles="true">');
    for (const matcher of externalResourceMatchers) {
      expect(html.data.html).not.toMatch(matcher);
    }
  });

  it("keeps export style selectors aligned with real report DOM attributes", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
      requestId: "report-selector-contract",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
      claim: "The login function stores a session token in localStorage.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });
    if (!analyzed.ok) throw new Error(analyzed.error.message);

    const html = await handlers.renderHtml({ report: analyzed.data, templateId: "todo" });

    expect(html.ok).toBe(true);
    if (!html.ok) throw new Error(html.error.message);
    expect(html.data.html).toContain("article[data-locale]");
    expect(html.data.html).toContain('article article[data-highlighted="true"]');
    expect(html.data.html).toContain('article article[data-appearance="scope-warning"]');
    expect(html.data.html).toContain('data-locale="zh-CN"');
    expect(html.data.html).toContain('data-highlighted="true"');
    expect(html.data.html).not.toContain('data-kind="extra-scope"');
  });

  it("treats report text URLs as self-contained content while blocking external resources", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
      requestId: "report-text-urls",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session. See https://example.com/spec.",
      claim: "The login function stores a session token in localStorage for http://localhost/docs.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });
    if (!analyzed.ok) throw new Error(analyzed.error.message);

    const reportWithTextUrls: JudgementReport = {
      ...analyzed.data,
      warnings: ["External references are plain text: https://example.com/spec"],
      judgements: analyzed.data.judgements.map((judgement, index) =>
        index === 0
          ? {
              ...judgement,
              explanation: `${judgement.explanation} See http://localhost/docs for operator notes.`,
            }
          : judgement,
      ),
    };
    const html = await handlers.renderHtml({ report: reportWithTextUrls });

    expect(html.ok).toBe(true);
    if (!html.ok) throw new Error(html.error.message);
    expect(html.data.html).toContain("https://example.com/spec");
    expect(html.data.html).toContain("http://localhost/docs");
    for (const matcher of externalResourceMatchers) {
      expect(html.data.html).not.toMatch(matcher);
    }
  });

  it("renderHtml honors locale and template options", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
      requestId: "localized-report",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
      claim: "The login function stores a session token in localStorage.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });
    if (!analyzed.ok) throw new Error(analyzed.error.message);

    const en = await handlers.renderHtml({
      locale: "en",
      report: analyzed.data,
      templateId: "todo",
    });
    const zh = await handlers.renderHtml({
      locale: "zh-CN",
      report: analyzed.data,
      templateId: "frontend",
    });

    expect(en.ok).toBe(true);
    expect(zh.ok).toBe(true);
    if (!en.ok) throw new Error(en.error.message);
    if (!zh.ok) throw new Error(zh.error.message);
    expect(en.data.html).toContain('<html lang="en">');
    expect(en.data.html).toContain('<style data-donecheck-report-styles="true">');
    expect(en.data.html).toContain("Task-list Report");
    expect(en.data.html).toContain("Findings");
    expect(zh.data.html).toContain('<html lang="zh-CN">');
    expect(zh.data.html).toContain('<style data-donecheck-report-styles="true">');
    expect(zh.data.html).toContain("前端报告");
    expect(zh.data.html).toContain("检查结果");
  });

  it("returns structured errors instead of throwing across IPC boundaries", async () => {
    const handlers = createDesktopIpcHandlers();
    const result = await handlers.analyze({
      requestId: "invalid-requirement",
      workspaceDir: await createWorkspace(),
      requirement: "",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid-input",
        message: "requirement is required",
      },
    });
  });

  it("uses an injected real history store for history IPC channels", async () => {
    const historyStore = createHistoryStore({ databasePath: ":memory:" });
    const handlers = createDesktopIpcHandlers({
      historyStore,
      providerFactory: () => realPipelineProvider,
    });
    const analyzed = await handlers.analyze({
      requestId: "history-analysis",
      workspaceDir: await createWorkspace(),
      requirement: "User can log in and persist a session.",
      claim: "The login function stores a session token in localStorage.",
      options: { generatedAt: "2026-07-01T00:00:00.000Z" },
    });
    if (!analyzed.ok) throw new Error(analyzed.error.message);

    const saved = await handlers.history.save({
      report: analyzed.data,
      requirement: "User can log in and persist a session.",
      workspaceDir: "/workspace/demo",
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error.message);
    const listed = await handlers.history.list();
    expect(listed).toEqual({
      ok: true,
      data: [
        {
          createdAt: saved.data.createdAt,
          id: saved.data.id,
          requirementSummary: "User can log in and persist a session.",
          workspaceDir: "/workspace/demo",
        },
      ],
    });
    const loaded = await handlers.history.get({ id: saved.data.id });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(loaded.data?.report).toEqual(analyzed.data);
    await expect(handlers.history.delete({ id: saved.data.id })).resolves.toEqual({
      ok: true,
      data: { deleted: true },
    });
    await expect(handlers.history.get({ id: saved.data.id })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    historyStore.close();
  });

  it("keeps structured not-implemented errors only when tests omit history injection", async () => {
    const handlers = createDesktopIpcHandlers();

    await expect(handlers.history.list()).resolves.toEqual({
      ok: false,
      error: {
        code: "not-implemented",
        message: "history store dependency was not provided",
      },
    });
    expect(typeof handlers.history.get).toBe("function");
    expect(typeof handlers.history.save).toBe("function");
    expect(typeof handlers.history.delete).toBe("function");
  });

  it("exposes settings and session credential IPC without persisting secrets", async () => {
    const settingsStore = createSettingsStore({ databasePath: ":memory:" });
    const credentials = createSessionCredentialStore();
    const handlers = createDesktopIpcHandlers({ credentials, settingsStore });

    await expect(handlers.settings.get()).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ providerMode: "bundled-free", topK: 5 }),
    });
    await expect(
      handlers.settings.set({
        patch: {
          ignore: ["dist", "dist", "node_modules"],
          providerMode: "openai-compatible",
          topK: 3,
        },
      }),
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        ignore: ["dist", "node_modules"],
        providerMode: "openai-compatible",
        topK: 3,
      }),
    });
    await expect(
      handlers.credentials.setSessionApiKey({ apiKey: "session-only-test-value" }),
    ).resolves.toEqual({ ok: true, data: { credentialStatus: "session" } });
    await expect(handlers.credentials.status()).resolves.toEqual({
      ok: true,
      data: { credentialStatus: "session" },
    });
    await expect(handlers.credentials.clearSessionApiKey()).resolves.toEqual({
      ok: true,
      data: { credentialStatus: "none" },
    });

    settingsStore.close();
  });

  describe("decompose IPC", () => {
    const multiEntryProvider: LLMProvider = {
      async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
        if (input.schemaName === "RequirementDecompositionOutput") {
          return {
            object: {
              assumptions: ["login flow assumes session cookie available"],
              claims: [
                { id: "CLAIM-1", text: "login stores token in localStorage" },
                { id: "CLAIM-2", text: "logout clears the token" },
              ],
              clarifyingQuestions: ["Should logout also clear cookies?"],
              confidence: 0.9,
              requirements: [
                { id: "REQ-1", text: "User can log in and persist a session." },
                { id: "REQ-2", text: "User can log out to clear the session." },
                { id: "REQ-3", text: "Session token expires after 30 minutes." },
              ],
              warnings: ["REQ-3 has no matching claim"],
            } as unknown as T,
            metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
            usage: {},
          };
        }
        if (input.schemaName === "FileSelectionModelOutput") {
          return {
            object: {
              candidateFiles: ["src/login.ts"],
              confidence: 0.95,
              reasoningSummary: "login implementation referenced by requirement and claim",
              warnings: [],
            } as unknown as T,
            metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
            usage: {},
          };
        }
        const reqId = /"id"\s*:\s*"(REQ-\d+)"/u.exec(input.prompt.user)?.[1] ?? "REQ-1";
        return {
          object: {
            confidence: 0.8,
            evidenceRefs: [
              {
                filePath: "src/login.ts",
                lineStart: 1,
                lineEnd: 1,
                snippetSummary: "login function persists a session token",
              },
            ],
            explanation: `evidence for ${reqId}`,
            judgementDraft: "fulfilled",
            matchedRequirementId: reqId,
            repairSuggestion: "keep test coverage for login persistence",
          } as unknown as T,
          metadata: { provider: "desktop-ipc-test", model: "stub", retries: 0 },
          usage: {},
        };
      },
    };

    it("decompose returns requirements, claims, assumptions, clarifyingQuestions, and warnings", async () => {
      const handlers = createDesktopIpcHandlers({ providerFactory: () => multiEntryProvider });
      const result = await handlers.decompose({
        requestId: "decompose-complete-response",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
        claim: "The login function stores a session token in localStorage.",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.data.requirements.map((r) => r.id)).toEqual(["REQ-1", "REQ-2", "REQ-3"]);
      expect(result.data.claims.map((c) => c.id)).toEqual(["CLAIM-1", "CLAIM-2"]);
      expect(result.data.assumptions).toEqual(["login flow assumes session cookie available"]);
      expect(result.data.clarifyingQuestions).toEqual(["Should logout also clear cookies?"]);
      expect(result.data.warnings).toEqual(["REQ-3 has no matching claim"]);
    });

    it("reserves one bundled workflow across decompose and analyze, then rejects replay", async () => {
      const settingsStore = createSettingsStore({ databasePath: ":memory:" });
      const quotaStore = createBundledFreeQuotaStore({});
      const workflowManager = createBundledFreeWorkflowManager(quotaStore);
      const handlers = createDesktopIpcHandlers({
        bundledFreeQuotaStore: quotaStore,
        bundledFreeWorkflowManager: workflowManager,
        providerFactory: () => multiEntryProvider,
        settingsStore,
      });
      const workspaceDir = await createWorkspace();
      const started = await handlers.bundledFree.startWorkflow({
        requestId: "bundled-workflow",
        requirement: "User can log in and persist a session.",
        workspaceDir,
      });
      expect(started).toMatchObject({ ok: true, data: { status: { remaining: 2 } } });
      if (!started.ok) throw new Error(started.error.message);

      const decomposed = await handlers.decompose({
        requestId: "bundled-workflow",
        requirement: "User can log in and persist a session.",
        workspaceDir,
        workflowToken: started.data.workflowToken,
      });
      expect(decomposed.ok).toBe(true);
      if (!decomposed.ok) throw new Error(decomposed.error.message);

      const analyzed = await handlers.analyze({
        claims: decomposed.data.claims,
        requestId: "bundled-workflow",
        requirement: "User can log in and persist a session.",
        requirements: decomposed.data.requirements,
        workspaceDir,
        workflowToken: started.data.workflowToken,
      });
      expect(analyzed.ok).toBe(true);
      await expect(
        handlers.analyze({
          requestId: "bundled-workflow",
          requirement: "User can log in and persist a session.",
          workspaceDir,
          workflowToken: started.data.workflowToken,
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "invalid-input" } });
      expect(quotaStore.status()).toMatchObject({ remaining: 2, used: 1 });
      quotaStore.close();
      settingsStore.close();
    });

    it("blocks oversized bundled projects before quota reservation or provider construction", async () => {
      const settingsStore = createSettingsStore({ databasePath: ":memory:" });
      const quotaStore = createBundledFreeQuotaStore({});
      const workspaceDir = await createWorkspace();
      await writeFile(join(workspaceDir, "large.ts"), "x".repeat(256 * 1024 + 1));
      let providerConstructions = 0;
      const handlers = createDesktopIpcHandlers({
        bundledFreeQuotaStore: quotaStore,
        bundledFreeWorkflowManager: createBundledFreeWorkflowManager(quotaStore),
        providerFactory: () => {
          providerConstructions += 1;
          return multiEntryProvider;
        },
        settingsStore,
      });

      await expect(
        handlers.bundledFree.startWorkflow({
          requestId: "oversized-workflow",
          requirement: "User can log in.",
          workspaceDir,
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "invalid-input" } });
      expect(quotaStore.status()).toMatchObject({ remaining: 3, used: 0 });
      expect(providerConstructions).toBe(0);
      quotaStore.close();
      settingsStore.close();
    });

    it("does not apply bundled quota or token requirements to mock mode", async () => {
      const settingsStore = createSettingsStore({ databasePath: ":memory:" });
      settingsStore.set({ providerMode: "mock" });
      const quotaStore = createBundledFreeQuotaStore({});
      const handlers = createDesktopIpcHandlers({
        bundledFreeQuotaStore: quotaStore,
        bundledFreeWorkflowManager: createBundledFreeWorkflowManager(quotaStore),
        providerFactory: () => multiEntryProvider,
        settingsStore,
      });

      await expect(
        handlers.decompose({
          requestId: "mock-without-token",
          requirement: "User can log in.",
          workspaceDir: await createWorkspace(),
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(quotaStore.status()).toMatchObject({ remaining: 3, used: 0 });
      quotaStore.close();
      settingsStore.close();
    });

    it("analyze passes requirements and claims arrays to the pipeline producing multi-entry coverage", async () => {
      const handlers = createDesktopIpcHandlers({ providerFactory: () => multiEntryProvider });
      const decomposition = await handlers.decompose({
        requestId: "multi-entry-analysis",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
        claim: "The login function stores a session token in localStorage.",
      });
      if (!decomposition.ok) throw new Error(decomposition.error.message);

      const result = await handlers.analyze({
        requestId: "multi-entry-analysis",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
        claim: "The login function stores a session token in localStorage.",
        requirements: decomposition.data.requirements,
        claims: decomposition.data.claims,
        options: { generatedAt: "2026-07-01T00:00:00.000Z" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.data.requirementCoverage.totalItems).toBe(3);
      expect(result.data.claimCoverage.totalItems).toBe(2);
      expect(result.data.judgements.length).toBeGreaterThan(2);
      const requirementJudgementIds = result.data.judgements
        .filter((j) => j.kind === "requirement")
        .map((j) => j.sourceId);
      expect(new Set(requirementJudgementIds).size).toBe(3);
    });

    it("analyze falls back to single-entry path when decomposition arrays are absent", async () => {
      const handlers = createDesktopIpcHandlers({ providerFactory: () => multiEntryProvider });
      const result = await handlers.analyze({
        requestId: "single-entry-analysis",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
        claim: "The login function stores a session token in localStorage.",
        options: { generatedAt: "2026-07-01T00:00:00.000Z" },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.data.requirementCoverage.totalItems).toBe(1);
    });

    it("decompose validates workspaceDir and requirement", async () => {
      const handlers = createDesktopIpcHandlers({ providerFactory: () => multiEntryProvider });
      const missingWorkspace = await handlers.decompose({
        requestId: "missing-workspace",
        workspaceDir: "",
        requirement: "need login",
      });
      expect(missingWorkspace).toEqual({
        ok: false,
        error: { code: "invalid-input", message: "workspaceDir is required" },
      });
      const missingRequirement = await handlers.decompose({
        requestId: "missing-requirement",
        workspaceDir: "/tmp",
        requirement: "",
      });
      expect(missingRequirement).toEqual({
        ok: false,
        error: { code: "invalid-input", message: "requirement is required" },
      });
    });

    it("decompose and analyze reject invalid workspaces before provider construction", async () => {
      let constructions = 0;
      const handlers = createDesktopIpcHandlers({
        providerFactory: () => {
          constructions += 1;
          return multiEntryProvider;
        },
      });
      const request = {
        requestId: "invalid-workspace",
        workspaceDir: "/missing/donecheck-desktop-workspace",
        requirement: "need login",
      };
      const decomposed = await handlers.decompose(request);
      const analyzed = await handlers.analyze(request);
      expect(decomposed).toMatchObject({ ok: false, error: { code: "invalid-input" } });
      expect(analyzed).toMatchObject({ ok: false, error: { code: "invalid-input" } });
      expect(constructions).toBe(0);
    });

    it("decompose returns a safe provider error category", async () => {
      const throwingProvider: LLMProvider = {
        async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
          if (input.schemaName === "RequirementDecompositionOutput") {
            throw new Error("decomposition provider failure");
          }
          throw new Error("unexpected call");
        },
      };
      const handlers = createDesktopIpcHandlers({ providerFactory: () => throwingProvider });
      const result = await handlers.decompose({
        requestId: "provider-error",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: "provider-error",
          message: "Online analysis could not be completed.",
          providerErrorKind: "unknown",
        },
      });
    });

    it("passes a cancellable signal to the provider", async () => {
      let receivedSignal: AbortSignal | undefined;
      const signalProvider: LLMProvider = {
        async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
          receivedSignal = input.signal;
          return multiEntryProvider.generateObject(input);
        },
      };
      const handlers = createDesktopIpcHandlers({ providerFactory: () => signalProvider });

      const result = await handlers.decompose({
        requestId: "provider-signal",
        workspaceDir: await createWorkspace(),
        requirement: "User can log in.",
      });

      expect(result.ok).toBe(true);
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(false);
    });

    it("aborts an active request and returns a structured error", async () => {
      let receivedSignal: AbortSignal | undefined;
      let markProviderStarted: (() => void) | undefined;
      const providerStarted = new Promise<void>((resolve) => {
        markProviderStarted = resolve;
      });
      const pendingProvider: LLMProvider = {
        generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
          receivedSignal = input.signal;
          markProviderStarted?.();
          return new Promise((_resolve, reject) => {
            input.signal?.addEventListener("abort", () => reject(input.signal?.reason), {
              once: true,
            });
          });
        },
      };
      const handlers = createDesktopIpcHandlers({ providerFactory: () => pendingProvider });
      const requestId = "cancel-active-request";
      const analysis = handlers.decompose({
        requestId,
        workspaceDir: await createWorkspace(),
        requirement: "User can log in.",
      });
      await providerStarted;

      const canceled = await handlers.cancelAnalysis({ requestId });
      const result = await analysis;

      expect(canceled).toEqual({ ok: true, data: undefined });
      expect(receivedSignal?.aborted).toBe(true);
      expect(result).toEqual({
        ok: false,
        error: { code: "canceled", message: "Analysis canceled" },
      });
    });
  });
});

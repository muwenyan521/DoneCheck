import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateObjectInput, GenerateObjectResult, LLMProvider } from "@donecheck/core";
import type { JudgementReport } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
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
  it("analyze calls the real core pipeline and returns a judgement report", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const result = await handlers.analyze({
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

  it("renderHtml returns a self-contained report document for a real report", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
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
    expect(html.data.html).toContain("判定列表");
    expect(html.data.html).toContain('<style data-donecheck-report-styles="true">');
    for (const matcher of externalResourceMatchers) {
      expect(html.data.html).not.toMatch(matcher);
    }
  });

  it("keeps export style selectors aligned with real report DOM attributes", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
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
    expect(html.data.html).toContain('article article[data-kind="extra-scope"]');
    expect(html.data.html).toContain('data-locale="zh-CN"');
    expect(html.data.html).toContain('data-highlighted="true"');
    expect(html.data.html).toContain('data-kind="extra-scope"');
  });

  it("treats report text URLs as self-contained content while blocking external resources", async () => {
    const handlers = createDesktopIpcHandlers({ providerFactory: () => realPipelineProvider });
    const analyzed = await handlers.analyze({
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
    expect(en.data.html).toContain("TODO Report");
    expect(en.data.html).toContain("Judgements");
    expect(zh.data.html).toContain('<html lang="zh-CN">');
    expect(zh.data.html).toContain('<style data-donecheck-report-styles="true">');
    expect(zh.data.html).toContain("前端报告");
    expect(zh.data.html).toContain("判定列表");
  });

  it("returns structured errors instead of throwing across IPC boundaries", async () => {
    const handlers = createDesktopIpcHandlers();
    const result = await handlers.analyze({
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
      data: expect.objectContaining({ providerMode: "mock", topK: 5 }),
    });
    await expect(
      handlers.settings.set({
        patch: {
          ignore: ["dist", "dist", "node_modules"],
          providerMode: "openai-compatible",
          structuredOutputStrict: false,
          topK: 3,
        },
      }),
    ).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        ignore: ["dist", "node_modules"],
        providerMode: "openai-compatible",
        structuredOutputStrict: false,
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

    it("analyze passes requirements and claims arrays to the pipeline producing multi-entry coverage", async () => {
      const handlers = createDesktopIpcHandlers({ providerFactory: () => multiEntryProvider });
      const decomposition = await handlers.decompose({
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
        claim: "The login function stores a session token in localStorage.",
      });
      if (!decomposition.ok) throw new Error(decomposition.error.message);

      const result = await handlers.analyze({
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
        workspaceDir: "",
        requirement: "need login",
      });
      expect(missingWorkspace).toEqual({
        ok: false,
        error: { code: "invalid-input", message: "workspaceDir is required" },
      });
      const missingRequirement = await handlers.decompose({
        workspaceDir: "/tmp",
        requirement: "",
      });
      expect(missingRequirement).toEqual({
        ok: false,
        error: { code: "invalid-input", message: "requirement is required" },
      });
    });

    it("decompose wraps provider errors as structured IPC errors", async () => {
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
        workspaceDir: await createWorkspace(),
        requirement: "User can log in and persist a session.",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: "unknown",
          message: "decomposition provider failure",
        },
      });
    });
  });
});

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateObjectInput, GenerateObjectResult, LLMProvider } from "@donecheck/core";
import type { JudgementReport } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { createHistoryStore } from "./history-store.js";
import { createDesktopIpcHandlers, injectDesktopExportStyles } from "./ipc-handlers.js";

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
    expect(html.data.html).toContain('<style data-donecheck-desktop-export="true">');
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

  it("injects desktop export styles idempotently and tolerates head casing", () => {
    const html =
      "<!doctype html><html><HEAD  ><title>Report</title></HEAD><body>DoneCheck</body></html>";

    const styled = injectDesktopExportStyles(html);
    const styledAgain = injectDesktopExportStyles(styled);

    expect(styled).toContain('<style data-donecheck-desktop-export="true">');
    expect(styled).toContain("</HEAD>");
    expect(styledAgain.match(/data-donecheck-desktop-export/g)).toHaveLength(1);
    expect(injectDesktopExportStyles("<html><body>DoneCheck</body></html>")).toBe(
      "<html><body>DoneCheck</body></html>",
    );
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
    expect(en.data.html).toContain('<style data-donecheck-desktop-export="true">');
    expect(en.data.html).toContain("TODO Report");
    expect(en.data.html).toContain("Judgements");
    expect(zh.data.html).toContain('<html lang="zh-CN">');
    expect(zh.data.html).toContain('<style data-donecheck-desktop-export="true">');
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
});

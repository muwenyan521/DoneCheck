import { reportTemplates } from "@donecheck/templates";
import { Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BundledFreePreflightResponse,
  BundledFreeStatus,
  CredentialStatus,
  DecomposeResponse,
  HistorySummary,
  JudgementReport,
  Locale,
  ReportTemplateId,
} from "../ipc-contract.js";
import type { ProviderErrorKind } from "../provider-error-kind.js";
import { type ProviderErrorUx, providerErrorUxForKind } from "../provider-error-ux.js";
import { type DesktopSettingsPatch, defaultDesktopSettings } from "../settings-model.js";
import { AppearanceMenu } from "./AppearanceMenu.js";
import { DecompositionReviewPanel } from "./DecompositionReviewPanel.js";
import { ReportPreview } from "./ReportPreview.js";
import { ProviderErrorNotice, SettingsPanel } from "./SettingsPanel.js";
import { getAnalysisStatusText } from "./analysis-status-copy.js";
import {
  type AnalyzeFlowError,
  type AnalyzeRequestSnapshot,
  createAnalyzeRequestSnapshot,
  createRetryAnalyzeRequestSnapshot,
  proceedAnalyze,
  startAnalyzeFlow,
} from "./analyze-flow.js";
import { applyUserInput, saveHistoryWithFeedback } from "./app-feedback.js";
import {
  type AppearancePreferences,
  defaultAppearance,
  persistAppearancePreferences,
  readAppearancePreferences,
  resolveTheme,
} from "./appearance.js";
import { getDesktopOperationFeedback } from "./desktop-operation-feedback.js";
import { copyRepairPrompt } from "./repair-prompt-copy.js";

interface DoneCheckDesktopWindow {
  readonly donecheck?: import("../ipc-contract.js").DesktopApi;
}

type AnalysisState =
  | { readonly kind: "ready" }
  | { readonly kind: "decomposing"; readonly snapshot: AnalyzeRequestSnapshot }
  | {
      readonly kind: "review";
      readonly snapshot: AnalyzeRequestSnapshot;
      readonly decomposition: DecomposeResponse;
    }
  | { readonly kind: "analyzing"; readonly snapshot: AnalyzeRequestSnapshot }
  | {
      readonly kind: "complete";
      readonly snapshot: AnalyzeRequestSnapshot;
      readonly report: JudgementReport;
    }
  | {
      readonly kind: "error";
      readonly source: "local" | "provider";
      readonly message: string;
      readonly providerError?: ProviderErrorUx;
      readonly snapshot?: AnalyzeRequestSnapshot;
    }
  | { readonly kind: "canceled" };

const desktopWindow = window as Window & DoneCheckDesktopWindow;

export function App() {
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [requirement, setRequirement] = useState("");
  const [claim, setClaim] = useState("");
  const [settings, setSettings] = useState(defaultDesktopSettings);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>("none");
  const [bundledFreeStatus, setBundledFreeStatus] = useState<BundledFreeStatus>();
  const [bundledFreePreflight, setBundledFreePreflight] = useState<BundledFreePreflightResponse>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: "ready" });
  const [history, setHistory] = useState<readonly HistorySummary[]>([]);
  const [historyLoadError, setHistoryLoadError] = useState<string>();
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [deletedHistoryId, setDeletedHistoryId] = useState<string>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [appearance, setAppearance] = useState<AppearancePreferences>(() =>
    window.localStorage === undefined
      ? defaultAppearance
      : readAppearancePreferences(window.localStorage),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const activeRequestId = useRef<string>();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const zh = settings.locale === "zh-CN";
  const busy = analysis.kind === "decomposing" || analysis.kind === "analyzing";
  const completed = analysis.kind === "complete" ? analysis : undefined;
  const resolvedTheme = resolveTheme(appearance.mode, systemPrefersDark);

  useEffect(() => {
    void loadSettings();
    void loadCredentialStatus();
    void loadBundledFreeStatus();
    void loadHistory();
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.locale;
  }, [settings.locale]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (window.localStorage !== undefined) {
      persistAppearancePreferences(window.localStorage, appearance);
    }
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.dataset.theme = resolvedTheme;
  }, [appearance, resolvedTheme]);
  useEffect(() => {
    if (settings.providerMode !== "bundled-free" || workspaceDir.trim().length === 0) {
      setBundledFreePreflight(undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadBundledFreePreflight(workspaceDir, settings.ignore);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [settings.ignore, settings.providerMode, workspaceDir]);

  useEffect(() => {
    if (!busy) return;
    setElapsedSeconds(0);
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  const bundledFreeBlocked =
    settings.providerMode === "bundled-free" &&
    (bundledFreeStatus?.remaining === 0 || bundledFreePreflight?.eligible === false);
  const canAnalyze = useMemo(
    () => workspaceDir.trim().length > 0 && requirement.trim().length > 0 && !busy,
    [busy, requirement, workspaceDir],
  );

  async function selectWorkspace() {
    const result = await desktopWindow.donecheck?.selectWorkspace();
    if (result?.ok && result.data.workspaceDir) {
      setWorkspaceDir(result.data.workspaceDir);
      setNotice(zh ? "已选择项目目录。" : "Project folder selected.");
      return;
    }
    setNotice(getDesktopOperationFeedback(settings.locale, "select-project-folder"));
  }

  async function analyze() {
    const api = desktopWindow.donecheck;
    if (!api) return showLocalError(getDesktopOperationFeedback(settings.locale, "app-connection"));
    const snapshot = createAnalyzeRequestSnapshot({
      claim,
      confirmRequirementDecomposition: settings.confirmRequirementDecomposition,
      locale: settings.locale,
      providerMode: settings.providerMode,
      requirement,
      settings: { ignore: settings.ignore, topK: settings.topK },
      templateId: settings.templateId,
      workspaceDir,
    });
    await runAnalyzeSnapshot(api, snapshot);
  }

  async function confirmDecomposition(decomposition: DecomposeResponse) {
    const api = desktopWindow.donecheck;
    if (!api || analysis.kind !== "review") return;
    const { snapshot } = analysis;
    activeRequestId.current = snapshot.requestId;
    setAnalysis({ kind: "analyzing", snapshot });
    const result = await proceedAnalyze({ api, decomposition, snapshot });
    if (activeRequestId.current !== snapshot.requestId) return;
    if (result.kind === "error") {
      activeRequestId.current = undefined;
      showAnalyzeFlowError(result.error, snapshot);
    } else {
      await finalizeReport(snapshot, result.report);
    }
  }

  function restartDecomposition() {
    if (analysis.kind !== "review") return;
    void analyzeSnapshot(analysis.snapshot);
  }

  async function analyzeSnapshot(snapshot: AnalyzeRequestSnapshot) {
    const api = desktopWindow.donecheck;
    if (!api) return showLocalError(getDesktopOperationFeedback(settings.locale, "app-connection"));
    await runAnalyzeSnapshot(api, createRetryAnalyzeRequestSnapshot(snapshot));
  }

  async function runAnalyzeSnapshot(
    api: NonNullable<DoneCheckDesktopWindow["donecheck"]>,
    snapshot: AnalyzeRequestSnapshot,
  ) {
    activeRequestId.current = snapshot.requestId;
    setSelectedHistoryId(undefined);
    setNotice("");
    setAnalysis({ kind: "decomposing", snapshot });
    const result = await startAnalyzeFlow({ api, snapshot });
    void loadBundledFreeStatus();
    if (activeRequestId.current !== snapshot.requestId) return;
    if (result.kind === "review")
      setAnalysis({
        kind: "review",
        decomposition: result.decomposition,
        snapshot: result.snapshot,
      });
    else if (result.kind === "error") showAnalyzeFlowError(result.error, snapshot);
    else await finalizeReport(snapshot, result.report);
  }

  function cancelAnalysis() {
    const requestId =
      activeRequestId.current ??
      (analysis.kind === "review" ? analysis.snapshot.requestId : undefined);
    activeRequestId.current = undefined;
    setAnalysis({ kind: "canceled" });
    setNotice(zh ? "分析已取消，未生成报告。" : "Analysis canceled. No report was created.");
    if (requestId) void desktopWindow.donecheck?.cancelAnalysis({ requestId });
    void loadBundledFreeStatus();
  }

  async function finalizeReport(snapshot: AnalyzeRequestSnapshot, report: JudgementReport) {
    if (activeRequestId.current !== snapshot.requestId) return;
    activeRequestId.current = undefined;
    setAnalysis({ kind: "complete", report, snapshot });
    setNotice(zh ? "分析完成。" : "Analysis complete.");
    if (settings.autoSaveHistory) await persistHistory(snapshot, report);
  }

  async function persistHistory(
    snapshot: AnalyzeRequestSnapshot,
    report: JudgementReport,
  ): Promise<boolean> {
    const result = await desktopWindow.donecheck?.history.save({
      report,
      requirement: snapshot.requirement,
      workspaceDir: snapshot.workspaceDir,
    });
    if (!result?.ok) {
      setNotice(getDesktopOperationFeedback(settings.locale, "save-report"));
      return false;
    }
    setSelectedHistoryId(result.data.id);
    await loadHistory();
    return true;
  }

  async function saveHistory() {
    if (!completed) return;
    await saveHistoryWithFeedback({
      locale: settings.locale,
      persist: () => persistHistory(completed.snapshot, completed.report),
      setNotice,
    });
  }

  async function loadHistory() {
    const result = await desktopWindow.donecheck?.history.list();
    if (result?.ok) {
      setHistory(result.data);
      setHistoryLoadError(undefined);
      return;
    }
    setHistoryLoadError(getDesktopOperationFeedback(settings.locale, "load-saved-reports"));
  }

  async function openHistory(id: string) {
    const result = await desktopWindow.donecheck?.history.get({ id });
    if (!result?.ok || !result.data) {
      setNotice(
        result?.ok
          ? zh
            ? "该报告已不存在。"
            : "This report no longer exists."
          : getDesktopOperationFeedback(settings.locale, "open-saved-report"),
      );
      return;
    }
    const snapshot = createAnalyzeRequestSnapshot({
      confirmRequirementDecomposition: settings.confirmRequirementDecomposition,
      locale: settings.locale,
      providerMode: settings.providerMode,
      requirement: result.data.requirementSummary,
      settings: { ignore: settings.ignore, topK: settings.topK },
      templateId: settings.templateId,
      workspaceDir: result.data.workspaceDir,
    });
    setWorkspaceDir(result.data.workspaceDir);
    setRequirement(result.data.requirementSummary);
    setSelectedHistoryId(id);
    setAnalysis({ kind: "complete", report: result.data.report, snapshot });
    setNotice(zh ? "已载入历史报告。" : "History report loaded.");
  }

  async function deleteHistory(id: string) {
    const result = await desktopWindow.donecheck?.history.delete({ id });
    if (!result?.ok) {
      setNotice(getDesktopOperationFeedback(settings.locale, "update-saved-reports"));
      return;
    }
    if (result.data.deleted) {
      setDeletedHistoryId(id);
      if (selectedHistoryId === id) setSelectedHistoryId(undefined);
      setNotice(zh ? "记录已移除，可撤销。" : "Entry removed. You can undo this action.");
      await loadHistory();
    }
  }

  async function restoreHistory() {
    if (!deletedHistoryId) return;
    const result = await desktopWindow.donecheck?.history.restore({ id: deletedHistoryId });
    if (!result?.ok) {
      setNotice(getDesktopOperationFeedback(settings.locale, "update-saved-reports"));
      return;
    }
    setDeletedHistoryId(undefined);
    setNotice(zh ? "记录已恢复。" : "Entry restored.");
    await loadHistory();
  }

  async function loadSettings() {
    const result = await desktopWindow.donecheck?.settings.get();
    if (!result?.ok) return;
    setSettings(result.data);
    if (result.data.reopenLastWorkspace && result.data.defaultWorkspaceDir)
      setWorkspaceDir(result.data.defaultWorkspaceDir);
  }

  async function updateSettings(patch: DesktopSettingsPatch) {
    const result = await desktopWindow.donecheck?.settings.set({ patch });
    if (!result?.ok) return { ok: false } as const;
    setSettings(result.data);
    setNotice(
      result.data.locale === "zh-CN"
        ? "设置已保存，将用于下一次分析。"
        : "Settings saved for the next analysis.",
    );
    return { ok: true } as const;
  }

  async function clearHistory() {
    if (busy || (history.length === 0 && deletedHistoryId === undefined)) return;
    const confirmed = window.confirm(
      zh
        ? "永久清空所有已保存报告？此操作无法撤销。"
        : "Clear all saved reports permanently? This cannot be undone.",
    );
    if (!confirmed) return;
    const result = await desktopWindow.donecheck?.history.clear();
    if (!result?.ok) {
      setNotice(getDesktopOperationFeedback(settings.locale, "update-saved-reports"));
      return;
    }
    setHistory([]);
    setSelectedHistoryId(undefined);
    setDeletedHistoryId(undefined);
    setNotice(zh ? "历史记录已清空。" : "History cleared.");
  }

  async function loadCredentialStatus() {
    const result = await desktopWindow.donecheck?.credentials.status();
    if (result?.ok) setCredentialStatus(result.data.credentialStatus);
  }

  async function loadBundledFreeStatus() {
    const result = await desktopWindow.donecheck?.bundledFree.status();
    if (result?.ok) setBundledFreeStatus(result.data);
  }

  async function loadBundledFreePreflight(workspace: string, ignore: readonly string[]) {
    const result = await desktopWindow.donecheck?.bundledFree.preflight({
      workspaceDir: workspace,
      ...(ignore.length === 0 ? {} : { ignore }),
    });
    if (result?.ok) setBundledFreePreflight(result.data);
  }

  async function exportHtml() {
    if (!completed) return;
    const result = await desktopWindow.donecheck?.exportHtml({
      defaultFileName: "donecheck-report.html",
      locale: completed.snapshot.locale,
      report: completed.report,
      templateId: completed.snapshot.templateId,
    });
    if (!result?.ok) {
      setNotice(getDesktopOperationFeedback(settings.locale, "export-report"));
      return;
    }
    setNotice(
      result.data.filePath
        ? zh
          ? "报告已导出。"
          : "Report exported."
        : zh
          ? "已取消导出。"
          : "Export canceled.",
    );
  }

  async function copyCurrentRepairPrompt() {
    if (!completed) return;
    const feedback = await copyRepairPrompt({
      api: desktopWindow.donecheck,
      locale: completed.snapshot.locale,
      report: completed.report,
    });
    setNotice(feedback.message);
  }

  function showAnalyzeFlowError(error: AnalyzeFlowError, snapshot?: AnalyzeRequestSnapshot) {
    switch (error.kind) {
      case "local-error":
        showLocalError(error.message, snapshot);
        return;
      case "provider-error":
        showProviderError(error.providerErrorKind, snapshot);
        return;
    }
  }

  function showLocalError(message: string, snapshot?: AnalyzeRequestSnapshot) {
    setAnalysis({ kind: "error", message, source: "local", ...(snapshot ? { snapshot } : {}) });
    setNotice(message);
  }

  function showProviderError(
    providerErrorKind: ProviderErrorKind,
    snapshot?: AnalyzeRequestSnapshot,
  ) {
    const providerError = providerErrorUxForKind(providerErrorKind);
    const message = settings.locale === "zh-CN" ? "本次在线分析未能完成。" : providerError.summary;
    setAnalysis({
      kind: "error",
      message,
      providerError,
      source: "provider",
      ...(snapshot ? { snapshot } : {}),
    });
    setNotice(message);
  }

  const error =
    analysis.kind === "error" && analysis.source === "provider"
      ? analysis.providerError
      : undefined;
  const statusText = busy
    ? analysis.kind === "decomposing"
      ? zh
        ? `正在理解需求，已用时 ${elapsedSeconds} 秒…`
        : `Understanding requirements, ${elapsedSeconds}s elapsed…`
      : zh
        ? `正在检查实现，已用时 ${elapsedSeconds} 秒…`
        : `Checking the implementation, ${elapsedSeconds}s elapsed…`
    : getAnalysisStatusText({ canAnalyze, locale: settings.locale, notice });

  return (
    <main className="shell">
      <header className="product-bar">
        <div className="product-identity">
          <span aria-hidden="true" className="product-mark" />
          <div>
            <strong>DoneCheck</strong>
            <span>{zh ? "软件验收" : "Software verification"}</span>
          </div>
        </div>
        <div className="product-actions">
          <AppearanceMenu
            locale={settings.locale}
            onChange={setAppearance}
            preferences={appearance}
            resolvedTheme={resolvedTheme}
          />
          <button
            aria-haspopup="dialog"
            aria-label={zh ? "设置" : "Settings"}
            className="icon-button"
            ref={settingsButton}
            disabled={busy}
            onClick={() => setSettingsOpen(true)}
            title={zh ? "设置" : "Settings"}
            type="button"
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      </header>
      <SettingsPanel
        credentialStatus={credentialStatus}
        isOpen={settingsOpen}
        locale={settings.locale}
        onClearSessionApiKey={async () => {
          const result = await desktopWindow.donecheck?.credentials.clearSessionApiKey();
          if (!result?.ok) return { ok: false };
          setCredentialStatus(result.data.credentialStatus);
          return { ok: true };
        }}
        onClose={() => {
          setSettingsOpen(false);
          window.setTimeout(() => settingsButton.current?.focus(), 0);
        }}
        onSaveSettingsWithSessionApiKey={async (patch, apiKey) => {
          const result = await desktopWindow.donecheck?.settings.setWithSessionApiKey({
            ...(apiKey === undefined ? {} : { apiKey }),
            patch,
          });
          if (!result?.ok) return { ok: false };
          setCredentialStatus(result.data.credentialStatus);
          setSettings(result.data.settings);
          setNotice(
            result.data.settings.locale === "zh-CN"
              ? "设置已保存，将用于下一次分析。"
              : "Settings saved for the next analysis.",
          );
          return { ok: true };
        }}
        onSettingsReset={async () => {
          const result = await desktopWindow.donecheck?.settings.reset();
          if (result?.ok) {
            setSettings(result.data);
            return { ok: true };
          }
          return { ok: false };
        }}
        settings={settings}
      />
      <div className="workspace-layout">
        <aside className="panel workspace-rail" aria-busy={busy}>
          <div className="rail-intro">
            <p className="eyebrow">{zh ? "新的检查" : "New verification"}</p>
            <h1>{zh ? "从需求开始" : "Start with the requirement"}</h1>
            <p>
              {zh
                ? "选择项目目录并说明要验收的行为。"
                : "Choose a project folder and describe the behavior to verify."}
            </p>
          </div>
          <section aria-label={zh ? "检查输入" : "Verification input"} className="input-stack">
            <label>
              {zh ? "项目目录" : "Project folder"}
              <div className="workspace-row">
                <input
                  disabled={busy}
                  onChange={(event) =>
                    applyUserInput({
                      setNotice,
                      setValue: setWorkspaceDir,
                      value: event.currentTarget.value,
                    })
                  }
                  placeholder={zh ? "选择或粘贴项目目录" : "Select or paste a project folder"}
                  value={workspaceDir}
                />
                <button disabled={busy} onClick={selectWorkspace} type="button">
                  {zh ? "选择目录" : "Browse"}
                </button>
              </div>
            </label>
            <label>
              {zh ? "需要验收的需求" : "Requirement to verify"}
              <textarea
                disabled={busy}
                onChange={(event) =>
                  applyUserInput({
                    setNotice,
                    setValue: setRequirement,
                    value: event.currentTarget.value,
                  })
                }
                placeholder={
                  zh
                    ? "描述预期功能和验收标准"
                    : "Describe expected behavior and acceptance criteria"
                }
                rows={5}
                value={requirement}
              />
            </label>
            <label>
              {zh ? "完成说明（可选）" : "Completion claim (optional)"}
              <textarea
                disabled={busy}
                onChange={(event) =>
                  applyUserInput({
                    setNotice,
                    setValue: setClaim,
                    value: event.currentTarget.value,
                  })
                }
                placeholder={zh ? "粘贴完成说明" : "Paste the completion summary"}
                rows={3}
                value={claim}
              />
            </label>
          </section>
          <div className="switch-row">
            <label>
              {zh ? "界面语言" : "Language"}
              <select
                disabled={busy}
                onChange={(event) =>
                  void updateSettings({ locale: event.currentTarget.value as Locale })
                }
                value={settings.locale}
              >
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {zh ? "报告类型" : "Report type"}
              <select
                disabled={busy}
                onChange={(event) =>
                  void updateSettings({ templateId: event.currentTarget.value as ReportTemplateId })
                }
                value={settings.templateId}
              >
                {reportTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {templateLabel(template.id, zh)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="rail-actions">
            <button
              className="primary"
              disabled={!canAnalyze || bundledFreeBlocked}
              onClick={analyze}
              type="button"
            >
              {zh ? "开始分析" : "Start analysis"}
            </button>
            {busy && (
              <button className="danger" onClick={cancelAnalysis} type="button">
                {zh ? "取消分析" : "Cancel analysis"}
              </button>
            )}
          </div>
          {settings.providerMode === "bundled-free" && (
            <section aria-live="polite" className="free-tier-status">
              <strong>{zh ? "内置免费分析" : "Built-in free analysis"}</strong>
              <span>
                {zh
                  ? `今日剩余 ${bundledFreeStatus?.remaining ?? 3} / ${bundledFreeStatus?.limit ?? 3} 次`
                  : `${bundledFreeStatus?.remaining ?? 3} / ${bundledFreeStatus?.limit ?? 3} tests remaining today`}
              </span>
              <span>
                {zh
                  ? "支持不超过 250 个可分析文件、总计 2 MiB，单文件 256 KiB。"
                  : "Up to 250 analyzable files, 2 MiB total, and 256 KiB per file."}
              </span>
              {bundledFreePreflight?.eligible === false && (
                <span className="free-tier-blocked">
                  {zh
                    ? "当前项目超过内置免费分析范围，请切换到自定义在线分析。"
                    : "This project exceeds the free analysis limit. Switch to a custom online provider."}
                </span>
              )}
              {bundledFreeStatus?.remaining === 0 && (
                <span className="free-tier-blocked">
                  {zh
                    ? `今日次数已用完，将于 ${new Date(bundledFreeStatus.resetsAt).toLocaleTimeString(settings.locale, { timeStyle: "short" })} 重置。`
                    : `Today's limit is used. It resets at ${new Date(bundledFreeStatus.resetsAt).toLocaleTimeString(settings.locale, { timeStyle: "short" })}.`}
                </span>
              )}
            </section>
          )}
          <p
            aria-live="polite"
            className={`status ${analysis.kind === "error" ? "error" : completed ? "ready" : busy ? "running" : "idle"}`}
          >
            <span className="status-label">
              {analysis.kind === "error"
                ? zh
                  ? "需要处理"
                  : "Action needed"
                : completed
                  ? zh
                    ? "分析完成"
                    : "Analysis complete"
                  : busy
                    ? zh
                      ? "正在分析"
                      : "Analyzing"
                    : zh
                      ? "准备就绪"
                      : "Ready"}
            </span>
            <span>
              {statusText}
              {busy && elapsedSeconds >= 20
                ? zh
                  ? " 分析响应较慢，可继续等待或取消。"
                  : " Analysis is taking longer than usual; you can wait or cancel."
                : ""}
            </span>
          </p>
          <section className="history-list" aria-labelledby="history-title">
            <div className="history-heading">
              <div>
                <p className="eyebrow">{zh ? "历史记录" : "History"}</p>
                <h2 id="history-title">{zh ? "已保存报告" : "Saved reports"}</h2>
              </div>
              <button
                className="text-button"
                disabled={busy || (history.length === 0 && deletedHistoryId === undefined)}
                onClick={() => void clearHistory()}
                type="button"
              >
                {zh ? "清空" : "Clear"}
              </button>
            </div>
            {deletedHistoryId && (
              <button className="secondary history-undo" onClick={restoreHistory} type="button">
                {zh ? "撤销移除" : "Undo remove"}
              </button>
            )}
            {history.length === 0 ? (
              <p className="history-empty">{zh ? "暂无已保存报告。" : "No saved reports yet."}</p>
            ) : (
              <ul>
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      className={
                        entry.id === selectedHistoryId ? "history-item selected" : "history-item"
                      }
                      disabled={busy}
                      onClick={() => openHistory(entry.id)}
                      type="button"
                    >
                      <strong>{entry.requirementSummary}</strong>
                      <time dateTime={entry.createdAt} title={entry.createdAt}>
                        {new Intl.DateTimeFormat(settings.locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(entry.createdAt))}
                      </time>
                    </button>
                    <button
                      aria-label={zh ? "移除已保存报告" : "Remove saved report"}
                      className="danger quiet"
                      disabled={busy}
                      onClick={() => deleteHistory(entry.id)}
                      type="button"
                    >
                      {zh ? "移除" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {historyLoadError && (
              <div className="history-error" role="alert">
                <p>{historyLoadError}</p>
                <button disabled={busy} onClick={loadHistory} type="button">
                  {zh ? "重试" : "Retry"}
                </button>
              </div>
            )}
          </section>
        </aside>
        <section className="review-canvas" aria-label={zh ? "检查结果" : "Verification result"}>
          <header className="review-header">
            <div>
              <p className="eyebrow">{zh ? "结果工作区" : "Review workspace"}</p>
              <h2>
                {completed
                  ? zh
                    ? "分析报告"
                    : "Analysis report"
                  : analysis.kind === "review"
                    ? zh
                      ? "确认检查范围"
                      : "Confirm the review scope"
                    : zh
                      ? "等待开始"
                      : "Ready when you are"}
              </h2>
            </div>
            {completed && (
              <div className="report-actions" aria-label={zh ? "报告操作" : "Report actions"}>
                <button disabled={busy} onClick={exportHtml} type="button">
                  {zh ? "导出" : "Export"}
                </button>
                <button
                  disabled={
                    busy ||
                    !completed.report.consolidatedRepairPrompt.content[
                      completed.snapshot.locale
                    ].trim()
                  }
                  onClick={copyCurrentRepairPrompt}
                  type="button"
                >
                  {zh ? "复制修复建议" : "Copy fix instructions"}
                </button>
                <button disabled={busy} onClick={saveHistory} type="button">
                  {zh ? "保存报告" : "Save report"}
                </button>
              </div>
            )}
          </header>
          {analysis.kind === "review" && (
            <DecompositionReviewPanel
              decomposition={analysis.decomposition}
              locale={analysis.snapshot.locale}
              onCancel={cancelAnalysis}
              onConfirm={confirmDecomposition}
              onRestart={restartDecomposition}
            />
          )}
          {error && <ProviderErrorNotice error={error} locale={settings.locale} />}
          {analysis.kind === "error" && analysis.source === "provider" && (
            <div className="recovery-actions">
              <button
                className="primary"
                disabled={!analysis.snapshot}
                onClick={() => analysis.snapshot && void analyzeSnapshot(analysis.snapshot)}
                type="button"
              >
                {zh ? "重试" : "Retry"}
              </button>
              <button onClick={() => setSettingsOpen(true)} type="button">
                {zh ? "检查设置" : "Check settings"}
              </button>
            </div>
          )}
          {completed ? (
            <article className="panel report-surface">
              <ReportPreview
                locale={completed.snapshot.locale}
                report={completed.report}
                templateId={completed.snapshot.templateId}
              />
            </article>
          ) : analysis.kind !== "review" ? (
            <div className="empty-state">
              <div>
                <span aria-hidden="true" className="empty-mark" />
                <h3>
                  {busy
                    ? zh
                      ? "正在准备可审查的证据"
                      : "Preparing evidence you can review"
                    : zh
                      ? "分析完成后，报告会显示在这里。"
                      : "Your report will appear here after analysis."}
                </h3>
                <p>
                  {busy
                    ? zh
                      ? "你可以继续等待，或在左侧安全地取消本次分析。"
                      : "You can wait here or safely cancel this analysis from the left rail."
                    : zh
                      ? "填写左侧信息后开始分析。"
                      : "Complete the input on the left to begin."}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function templateLabel(templateId: ReportTemplateId, zh: boolean): string {
  const labels: Record<ReportTemplateId, readonly [string, string]> = {
    frontend: ["前端检查", "Frontend check"],
    generic: ["通用检查", "General check"],
    todo: ["待办检查", "Task check"],
  };
  return labels[templateId][zh ? 0 : 1];
}

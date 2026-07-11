import { reportTemplates } from "@donecheck/templates";
import { useEffect, useMemo, useState } from "react";
import type {
  CredentialStatus,
  DecomposeResponse,
  HistorySummary,
  JudgementReport,
  Locale,
  ReportTemplateId,
} from "../ipc-contract.js";
import { classifyProviderError } from "../provider-error-ux.js";
import { type DesktopSettingsPatch, defaultDesktopSettings } from "../settings-model.js";
import { DecompositionReviewPanel } from "./DecompositionReviewPanel.js";
import { ReportPreview } from "./ReportPreview.js";
import { ProviderErrorNotice, SettingsPanel } from "./SettingsPanel.js";
import { proceedAnalyze, startAnalyzeFlow } from "./analyze-flow.js";

type RunState = "idle" | "running" | "ready" | "error";

interface DoneCheckDesktopWindow {
  readonly donecheck?: import("../ipc-contract.js").DesktopApi;
}

const desktopWindow = window as Window & DoneCheckDesktopWindow;

export function App() {
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [requirement, setRequirement] = useState("");
  const [claim, setClaim] = useState("");
  const [settings, setSettings] = useState(defaultDesktopSettings);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>("none");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [report, setReport] = useState<JudgementReport | undefined>();
  const [pendingDecomposition, setPendingDecomposition] = useState<DecomposeResponse | undefined>();
  const [history, setHistory] = useState<readonly HistorySummary[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const [status, setStatus] = useState<RunState>("idle");
  const [message, setMessage] = useState("选择 workspace 并填写需求后开始分析。");
  const [providerError, setProviderError] = useState<
    ReturnType<typeof classifyProviderError> | undefined
  >();

  useEffect(() => {
    void loadSettings();
    void loadCredentialStatus();
    void loadHistory();
  }, []);

  const canAnalyze = useMemo(
    () => workspaceDir.trim().length > 0 && requirement.trim().length > 0 && status !== "running",
    [requirement, status, workspaceDir],
  );

  async function selectWorkspace() {
    const result = await desktopWindow.donecheck?.selectWorkspace();
    if (result?.ok && result.data.workspaceDir !== undefined) {
      setWorkspaceDir(result.data.workspaceDir);
      await updateRecentWorkspaces(result.data.workspaceDir);
      setMessage(`已选择 workspace：${result.data.workspaceDir}`);
    } else if (result && !result.ok) {
      setStatus("error");
      setMessage(result.error.message);
    }
  }

  async function analyze() {
    const api = desktopWindow.donecheck;
    if (api === undefined) {
      setStatus("error");
      setMessage("preload API unavailable");
      setProviderError(classifyProviderError("preload API unavailable"));
      return;
    }
    setStatus("running");
    setProviderError(undefined);
    setPendingDecomposition(undefined);
    setMessage("正在拆分需求与声明...");
    const claimValue = claim.trim().length === 0 ? undefined : claim;
    const result = await startAnalyzeFlow({
      api,
      workspaceDir,
      requirement,
      ...(claimValue === undefined ? {} : { claim: claimValue }),
      confirmRequirementDecomposition: settings.confirmRequirementDecomposition,
      settings: { ignore: settings.ignore, topK: settings.topK },
    });
    if (result.kind === "review") {
      setPendingDecomposition(result.decomposition);
      setStatus("idle");
      setMessage("已拆分需求与声明，请确认后继续分析。");
      return;
    }
    if (result.kind === "error") {
      setStatus("error");
      setMessage(result.error);
      setProviderError(classifyProviderError(result.error));
      return;
    }
    await finalizeReport(result.report);
  }

  async function confirmDecomposition() {
    const api = desktopWindow.donecheck;
    if (api === undefined || pendingDecomposition === undefined) return;
    const decomposition = pendingDecomposition;
    setStatus("running");
    setProviderError(undefined);
    setMessage("正在调用 DoneCheck pipeline...");
    const claimValue = claim.trim().length === 0 ? undefined : claim;
    const result = await proceedAnalyze(
      {
        api,
        workspaceDir,
        requirement,
        ...(claimValue === undefined ? {} : { claim: claimValue }),
        confirmRequirementDecomposition: settings.confirmRequirementDecomposition,
        settings: { ignore: settings.ignore, topK: settings.topK },
      },
      decomposition,
    );
    if (result.kind === "error") {
      setStatus("error");
      setMessage(result.error);
      setProviderError(classifyProviderError(result.error));
      return;
    }
    await finalizeReport(result.report);
  }

  function cancelDecomposition() {
    setPendingDecomposition(undefined);
    setStatus("idle");
    setMessage("已取消分析，未生成报告。");
  }

  async function finalizeReport(nextReport: JudgementReport) {
    setPendingDecomposition(undefined);
    setReport(nextReport);
    await updateRecentWorkspaces(workspaceDir);
    if (settings.autoSaveHistory) {
      await desktopWindow.donecheck?.history.save({
        report: nextReport,
        requirement,
        workspaceDir,
      });
      await loadHistory();
    }
    setStatus("ready");
    setMessage("分析完成，可预览或导出 HTML。");
  }

  async function loadHistory() {
    const result = await desktopWindow.donecheck?.history.list();
    if (result?.ok) {
      setHistory(result.data);
    } else if (result && !result.ok) {
      setStatus("error");
      setMessage(result.error.message);
    }
  }

  async function saveHistory() {
    if (report === undefined) return;
    const result = await desktopWindow.donecheck?.history.save({
      report,
      requirement,
      workspaceDir,
    });
    if (!result?.ok) {
      setStatus("error");
      setMessage(result?.error.message ?? "preload API unavailable");
      return;
    }
    setSelectedHistoryId(result.data.id);
    setMessage(`已保存历史：${result.data.requirementSummary}`);
    await loadHistory();
  }

  async function openHistory(id: string) {
    const result = await desktopWindow.donecheck?.history.get({ id });
    if (!result?.ok) {
      setStatus("error");
      setMessage(result?.error.message ?? "preload API unavailable");
      return;
    }
    if (result.data === undefined) {
      setMessage("历史记录不存在或已删除。");
      await loadHistory();
      return;
    }
    setWorkspaceDir(result.data.workspaceDir);
    setSelectedHistoryId(result.data.id);
    setReport(result.data.report);
    setStatus("ready");
    setMessage(`已载入历史：${result.data.requirementSummary}`);
  }

  async function deleteHistory(id: string) {
    const result = await desktopWindow.donecheck?.history.delete({ id });
    if (!result?.ok) {
      setStatus("error");
      setMessage(result?.error.message ?? "preload API unavailable");
      return;
    }
    if (selectedHistoryId === id) setSelectedHistoryId(undefined);
    setMessage(result.data.deleted ? "历史记录已删除。" : "历史记录不存在或已删除。");
    await loadHistory();
  }

  async function loadSettings() {
    const result = await desktopWindow.donecheck?.settings.get();
    if (result?.ok) {
      setSettings(result.data);
      if (result.data.reopenLastWorkspace && result.data.defaultWorkspaceDir !== null) {
        setWorkspaceDir(result.data.defaultWorkspaceDir);
      }
    } else if (result && !result.ok) {
      setStatus("error");
      setMessage(result.error.message);
    }
  }

  async function loadCredentialStatus() {
    const result = await desktopWindow.donecheck?.credentials.status();
    if (result?.ok) setCredentialStatus(result.data.credentialStatus);
  }

  async function updateSettings(patch: DesktopSettingsPatch) {
    const result = await desktopWindow.donecheck?.settings.set({ patch });
    if (!result?.ok) {
      setStatus("error");
      setMessage(result?.error.message ?? "preload API unavailable");
      return;
    }
    setSettings(result.data);
    setMessage("设置已保存。Provider、topK、ignore 与 strict 会在下一次 Analyze 生效。");
  }

  async function resetSettings() {
    const result = await desktopWindow.donecheck?.settings.reset();
    if (result?.ok) {
      setSettings(result.data);
      setMessage("非敏感设置已重置。");
    }
  }

  async function saveSessionApiKey(apiKey: string) {
    const result = await desktopWindow.donecheck?.credentials.setSessionApiKey({ apiKey });
    if (result?.ok) setCredentialStatus(result.data.credentialStatus);
  }

  async function clearSessionApiKey() {
    const result = await desktopWindow.donecheck?.credentials.clearSessionApiKey();
    if (result?.ok) setCredentialStatus(result.data.credentialStatus);
  }

  async function updateRecentWorkspaces(nextWorkspaceDir: string) {
    if (nextWorkspaceDir.trim().length === 0) return;
    await updateSettings({
      defaultWorkspaceDir: nextWorkspaceDir,
      recentWorkspaces: [nextWorkspaceDir, ...settings.recentWorkspaces],
    });
  }

  async function exportHtml() {
    if (report === undefined) return;
    const result = await desktopWindow.donecheck?.exportHtml({
      defaultFileName: "donecheck-report.html",
      locale: settings.locale,
      report,
      templateId: settings.templateId,
    });
    if (result?.ok) {
      setMessage(
        result.data.filePath === undefined ? "已取消导出。" : `已导出：${result.data.filePath}`,
      );
    } else if (result && !result.ok) {
      setStatus("error");
      setMessage(result.error.message);
    }
  }

  return (
    <main className="shell">
      <section className="panel controls">
        <div className="title-block">
          <p className="eyebrow">DoneCheck Desktop</p>
          <h1>Stage 8.5 GUI</h1>
          <p>
            当前 Provider mode：
            {settings.providerMode === "mock" ? "Deterministic mock" : "OpenAI-compatible"}
          </p>
        </div>

        <button onClick={() => setSettingsOpen(true)} type="button">
          Settings
        </button>
        <SettingsPanel
          credentialStatus={credentialStatus}
          isOpen={settingsOpen}
          onClearSessionApiKey={clearSessionApiKey}
          onClose={() => setSettingsOpen(false)}
          onSaveSessionApiKey={saveSessionApiKey}
          onSettingsChange={updateSettings}
          onSettingsReset={resetSettings}
          settings={settings}
        />

        <label>
          Workspace
          <div className="workspace-row">
            <input
              onChange={(event) => setWorkspaceDir(event.currentTarget.value)}
              placeholder="选择或粘贴 workspace 目录"
              value={workspaceDir}
            />
            <button onClick={selectWorkspace} type="button">
              选择目录
            </button>
          </div>
        </label>

        <label>
          需求
          <textarea
            onChange={(event) => setRequirement(event.currentTarget.value)}
            placeholder="输入原始需求"
            rows={5}
            value={requirement}
          />
        </label>

        <label>
          AI 完成说明（可选）
          <textarea
            onChange={(event) => setClaim(event.currentTarget.value)}
            placeholder="输入 AI 声称已完成的内容"
            rows={4}
            value={claim}
          />
        </label>

        <div className="switch-row">
          <label>
            Locale
            <select
              onChange={(event) => updateSettings({ locale: event.currentTarget.value as Locale })}
              value={settings.locale}
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Template
            <select
              onChange={(event) =>
                updateSettings({ templateId: event.currentTarget.value as ReportTemplateId })
              }
              value={settings.templateId}
            >
              {reportTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="actions">
          <button disabled={!canAnalyze} onClick={analyze} type="button">
            {status === "running" ? "分析中..." : "开始分析"}
          </button>
          <button disabled={report === undefined} onClick={exportHtml} type="button">
            导出 HTML
          </button>
          <button disabled={report === undefined} onClick={saveHistory} type="button">
            保存历史
          </button>
          <button onClick={loadHistory} type="button">
            刷新历史
          </button>
        </div>
        {pendingDecomposition === undefined ? null : (
          <DecompositionReviewPanel
            decomposition={pendingDecomposition}
            onCancel={cancelDecomposition}
            onConfirm={confirmDecomposition}
          />
        )}
        <p className={`status ${status}`}>{message}</p>
        {providerError === undefined ? null : (
          <ProviderErrorNotice error={providerError} onOpenSettings={() => setSettingsOpen(true)} />
        )}
        <section className="history-list">
          <h2>历史记录</h2>
          {history.length === 0 ? (
            <p className="history-empty">暂无历史。保存报告后可在这里回看。</p>
          ) : (
            <ul>
              {history.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={
                      entry.id === selectedHistoryId ? "history-item selected" : "history-item"
                    }
                    onClick={() => openHistory(entry.id)}
                    type="button"
                  >
                    <strong>{entry.requirementSummary}</strong>
                    <span>{entry.workspaceDir}</span>
                    <time>{entry.createdAt}</time>
                  </button>
                  <button className="danger" onClick={() => deleteHistory(entry.id)} type="button">
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section
        className={settings.showDebugSections ? "panel preview" : "panel preview hide-debug"}
      >
        {report === undefined ? (
          <div className="empty-state">暂无报告。分析完成后将在这里展示 JudgementReport。</div>
        ) : (
          <ReportPreview
            locale={settings.locale}
            report={report}
            templateId={settings.templateId}
          />
        )}
      </section>
    </main>
  );
}

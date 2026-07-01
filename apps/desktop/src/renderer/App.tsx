import { reportTemplates } from "@donecheck/templates";
import { useMemo, useState } from "react";
import type { HistorySummary, JudgementReport, Locale, ReportTemplateId } from "../ipc-contract.js";
import { ReportPreview } from "./ReportPreview.js";

type RunState = "idle" | "running" | "ready" | "error";

interface DoneCheckDesktopWindow {
  readonly donecheck?: import("../ipc-contract.js").DesktopApi;
}

const desktopWindow = window as Window & DoneCheckDesktopWindow;

export function App() {
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [requirement, setRequirement] = useState("");
  const [claim, setClaim] = useState("");
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [templateId, setTemplateId] = useState<ReportTemplateId>("generic");
  const [report, setReport] = useState<JudgementReport | undefined>();
  const [history, setHistory] = useState<readonly HistorySummary[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<RunState>("idle");
  const [message, setMessage] = useState("选择 workspace 并填写需求后开始分析。");

  const canAnalyze = useMemo(
    () => workspaceDir.trim().length > 0 && requirement.trim().length > 0 && status !== "running",
    [requirement, status, workspaceDir],
  );

  async function selectWorkspace() {
    const result = await desktopWindow.donecheck?.selectWorkspace();
    if (result?.ok && result.data.workspaceDir !== undefined) {
      setWorkspaceDir(result.data.workspaceDir);
      setMessage(`已选择 workspace：${result.data.workspaceDir}`);
    } else if (result && !result.ok) {
      setStatus("error");
      setMessage(result.error.message);
    }
  }

  async function analyze() {
    setStatus("running");
    setMessage("正在调用 DoneCheck pipeline...");
    const result = await desktopWindow.donecheck?.analyze({
      workspaceDir,
      requirement,
      ...(claim.trim().length === 0 ? {} : { claim }),
    });
    if (!result?.ok) {
      setStatus("error");
      setMessage(result?.error.message ?? "preload API unavailable");
      return;
    }
    setReport(result.data);
    await renderHtml(result.data, locale, templateId);
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
    await renderHtml(result.data.report, locale, templateId);
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

  async function renderHtml(
    nextReport: JudgementReport,
    nextLocale: Locale,
    nextTemplate: ReportTemplateId,
  ) {
    const result = await desktopWindow.donecheck?.renderHtml({
      locale: nextLocale,
      report: nextReport,
      templateId: nextTemplate,
    });
    if (result?.ok) setHtml(result.data.html);
  }

  async function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    if (report !== undefined) await renderHtml(report, nextLocale, templateId);
  }

  async function changeTemplate(nextTemplate: ReportTemplateId) {
    setTemplateId(nextTemplate);
    if (report !== undefined) await renderHtml(report, locale, nextTemplate);
  }

  async function exportHtml() {
    const result = await desktopWindow.donecheck?.exportHtml({
      defaultFileName: "donecheck-report.html",
      html,
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
          <h1>阶段 6 GUI</h1>
          <p>GUI 只消费 core pipeline 与 report-ui 展示结果，不重算规则。</p>
        </div>

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
              onChange={(event) => changeLocale(event.currentTarget.value as Locale)}
              value={locale}
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Template
            <select
              onChange={(event) => changeTemplate(event.currentTarget.value as ReportTemplateId)}
              value={templateId}
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
          <button disabled={html.length === 0} onClick={exportHtml} type="button">
            导出 HTML
          </button>
          <button disabled={report === undefined} onClick={saveHistory} type="button">
            保存历史
          </button>
          <button onClick={loadHistory} type="button">
            刷新历史
          </button>
        </div>
        <p className={`status ${status}`}>{message}</p>
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

      <section className="panel preview">
        {report === undefined ? (
          <div className="empty-state">暂无报告。分析完成后将在这里展示 JudgementReport。</div>
        ) : (
          <ReportPreview locale={locale} report={report} templateId={templateId} />
        )}
      </section>
    </main>
  );
}

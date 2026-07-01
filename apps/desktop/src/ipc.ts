import { runDoneCheckPipelineNode } from "@donecheck/core";
import type { JudgementReport } from "@donecheck/core";
import { createProvider } from "@donecheck/provider-openai";
import { createHtmlReportDocument } from "@donecheck/report-ui";
import { defaultTemplate } from "@donecheck/templates";
import { ipcMain } from "electron";
import { verifyNativeStorageAvailable } from "./index.js";

interface AnalyzeRequest {
  readonly workspacePath: string;
  readonly requirement: string;
  readonly claim?: string;
}

interface RenderHtmlRequest {
  readonly report: JudgementReport;
}

export function registerIpcHandlers(): void {
  ipcMain.handle("donecheck:analyze", async (_event, req: AnalyzeRequest) => {
    const provider = createProvider();
    const result = await runDoneCheckPipelineNode({
      workspacePath: req.workspacePath,
      requirement: req.requirement,
      ...(req.claim === undefined ? {} : { claim: req.claim }),
      provider,
    });
    return result.report;
  });

  ipcMain.handle("donecheck:render-html", async (_event, req: RenderHtmlRequest) => {
    return createHtmlReportDocument({
      locale: "en",
      report: req.report,
      template: defaultTemplate,
      title: "DoneCheck Report",
    });
  });

  ipcMain.handle("donecheck:verify-storage", () => verifyNativeStorageAvailable());
}

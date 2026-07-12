import type { Locale } from "../ipc-contract.js";

export type DesktopOperation =
  | "app-connection"
  | "copy-fix-instructions"
  | "export-report"
  | "load-saved-reports"
  | "open-saved-report"
  | "save-report"
  | "select-project-folder"
  | "update-saved-reports";

export function getDesktopOperationFeedback(locale: Locale, operation: DesktopOperation): string {
  const messages = {
    en: {
      "app-connection": "The app connection is unavailable. Restart the app.",
      "copy-fix-instructions": "Could not copy the fix instructions. Try again.",
      "export-report": "Could not export the report. Check the save location and try again.",
      "load-saved-reports": "Could not load saved reports. Try again shortly.",
      "open-saved-report": "Could not open this report. Try again.",
      "save-report": "Could not save the report. Try again.",
      "select-project-folder": "Could not select the project folder. Try again.",
      "update-saved-reports": "Could not update saved reports. Try again.",
    },
    "zh-CN": {
      "app-connection": "应用连接不可用，请重新启动。",
      "copy-fix-instructions": "无法复制修复建议，请重试。",
      "export-report": "无法导出报告，请检查保存位置后重试。",
      "load-saved-reports": "无法读取已保存报告，请稍后重试。",
      "open-saved-report": "无法打开该报告，请重试。",
      "save-report": "无法保存报告，请重试。",
      "select-project-folder": "无法选择项目目录，请重试。",
      "update-saved-reports": "无法更新已保存报告，请重试。",
    },
  } as const;
  return messages[locale][operation];
}

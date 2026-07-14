import { useEffect, useRef, useState } from "react";
import type { CredentialStatus } from "../desktop-provider.js";
import type { Locale, ReportTemplateId } from "../ipc-contract.js";
import type { ProviderErrorKind, ProviderErrorUx } from "../provider-error-ux.js";
import type { DesktopSettings, DesktopSettingsPatch, ProviderMode } from "../settings-model.js";

export interface SettingsPanelProps {
  readonly isOpen: boolean;
  readonly locale: Locale;
  readonly settings: DesktopSettings;
  readonly credentialStatus: CredentialStatus;
  readonly onClose: () => void;
  readonly onSettingsChange: (patch: DesktopSettingsPatch) => Promise<SettingsOperationResult>;
  readonly onSettingsReset: () => Promise<SettingsOperationResult>;
  readonly onSaveSessionApiKey: (apiKey: string) => Promise<SettingsOperationResult>;
  readonly onClearSessionApiKey: () => Promise<SettingsOperationResult>;
}

export type SettingsOperationResult = { readonly ok: true } | { readonly ok: false };

export async function performSettingsOperation(input: {
  readonly failureMessage: string;
  readonly onSuccess: () => void;
  readonly operation: () => Promise<SettingsOperationResult>;
  readonly setError: (message: string | undefined) => void;
}): Promise<void> {
  const result = await input.operation();
  if (!result.ok) {
    input.setError(input.failureMessage);
    return;
  }
  input.setError(undefined);
  input.onSuccess();
}

export interface ProviderErrorNoticeProps {
  readonly error: ProviderErrorUx;
  readonly locale: Locale;
}

export function createSettingsDraft(settings: DesktopSettings): DesktopSettings {
  return {
    ...settings,
    ignore: [...settings.ignore],
    recentWorkspaces: [...settings.recentWorkspaces],
  };
}

export function toSettingsPatch(draft: DesktopSettings): DesktopSettingsPatch {
  return draft;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [draft, setDraft] = useState(() => createSettingsDraft(props.settings));
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const zh = props.locale === "zh-CN";

  useEffect(() => {
    if (!props.isOpen) return;
    setDraft(createSettingsDraft(props.settings));
    setOperationError(undefined);
    window.setTimeout(() => firstControlRef.current?.focus(), 0);
  }, [props.isOpen, props.settings]);

  if (!props.isOpen) return null;

  function updateDraft(patch: DesktopSettingsPatch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function closeWithoutSaving() {
    setDraft(createSettingsDraft(props.settings));
    setOperationError(undefined);
    props.onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWithoutSaving();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    );
    if (!controls || controls.length === 0) return;
    const first = controls.item(0);
    const last = controls.item(controls.length - 1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="settings-overlay">
      <dialog
        open
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-panel"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
      >
        <div className="settings-header">
          <div>
            <p className="eyebrow">{zh ? "偏好设置" : "Preferences"}</p>
            <h2 id="settings-title">{zh ? "设置" : "Settings"}</h2>
          </div>
          <button
            disabled={submitting}
            ref={firstControlRef}
            type="button"
            onClick={closeWithoutSaving}
          >
            {zh ? "关闭" : "Close"}
          </button>
        </div>

        <fieldset>
          <legend>{zh ? "分析方式" : "Analysis method"}</legend>
          <label>
            {zh ? "选择方式" : "Choose a method"}
            <select
              value={draft.providerMode}
              onChange={(event) =>
                updateDraft({ providerMode: event.currentTarget.value as ProviderMode })
              }
            >
              <option value="bundled-free">{zh ? "内置免费分析" : "Built-in free analysis"}</option>
              <option value="mock">{zh ? "离线检查" : "Offline analysis"}</option>
              <option value="openai-compatible">{zh ? "在线分析" : "Online analysis"}</option>
            </select>
          </label>
          <p className="settings-help">
            {draft.providerMode === "bundled-free"
              ? zh
                ? "每天可完成 3 次内置免费分析，仅支持不超过 250 个可分析文件、总计 2 MiB 的项目。"
                : "Three complete built-in free analyses are available daily for projects up to 250 analyzable files and 2 MiB total."
              : draft.providerMode === "mock"
                ? zh
                  ? "离线检查可直接使用。"
                  : "Offline analysis is ready to use."
                : zh
                  ? "在线分析将使用下方地址、模型和仅保留在内存中的访问密钥。"
                  : "Online analysis will use the address, model, and memory-only access key below."}
          </p>
          {draft.providerMode === "openai-compatible" && (
            <>
              <label>
                {zh ? "在线分析地址" : "Online analysis address"}
                <input
                  value={draft.providerBaseUrl}
                  onChange={(event) => updateDraft({ providerBaseUrl: event.currentTarget.value })}
                  placeholder={zh ? "留空时使用默认设置" : "Leave blank to use the default setting"}
                />
              </label>
              <label>
                {zh ? "分析模型" : "Analysis model"}
                <input
                  value={draft.providerModel}
                  onChange={(event) => updateDraft({ providerModel: event.currentTarget.value })}
                  placeholder={zh ? "留空时使用默认设置" : "Leave blank to use the default setting"}
                />
              </label>
              <SessionKeyInput
                credentialStatus={props.credentialStatus}
                locale={props.locale}
                onClear={props.onClearSessionApiKey}
                onSave={props.onSaveSessionApiKey}
              />
            </>
          )}
        </fieldset>

        <details>
          <summary>{zh ? "高级选项" : "Advanced options"}</summary>
          <div className="settings-advanced">
            <fieldset>
              <legend>{zh ? "分析参数" : "Analysis options"}</legend>
              <label>
                {zh ? "最多检查文件数" : "Maximum files to check"}
                <input
                  min={1}
                  type="number"
                  value={draft.topK}
                  onChange={(event) => updateDraft({ topK: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                {zh ? "不检查的文件或目录（每行一项）" : "Files or folders to skip (one per line)"}
                <textarea
                  rows={4}
                  value={draft.ignore.join("\n")}
                  onChange={(event) =>
                    updateDraft({ ignore: splitLines(event.currentTarget.value) })
                  }
                />
              </label>
              <Checkbox
                checked={draft.confirmRequirementDecomposition}
                label={zh ? "检查前确认识别内容" : "Confirm detected items before checking"}
                onChange={(checked) => updateDraft({ confirmRequirementDecomposition: checked })}
              />
            </fieldset>

            <fieldset>
              <legend>{zh ? "报告显示" : "Report display"}</legend>
              <div className="switch-row">
                <label>
                  {zh ? "语言" : "Language"}
                  <select
                    value={draft.locale}
                    onChange={(event) =>
                      updateDraft({ locale: event.currentTarget.value as Locale })
                    }
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  {zh ? "报告类型" : "Report type"}
                  <select
                    value={draft.templateId}
                    onChange={(event) =>
                      updateDraft({ templateId: event.currentTarget.value as ReportTemplateId })
                    }
                  >
                    <option value="generic">{zh ? "通用" : "General"}</option>
                    <option value="todo">{zh ? "待办检查" : "Task check"}</option>
                    <option value="frontend">{zh ? "前端检查" : "Frontend check"}</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>{zh ? "项目与记录" : "Project and saved reports"}</legend>
              <label>
                {zh ? "默认项目目录" : "Default project folder"}
                <input
                  value={draft.defaultWorkspaceDir ?? ""}
                  onChange={(event) =>
                    updateDraft({ defaultWorkspaceDir: event.currentTarget.value || null })
                  }
                />
              </label>
              <Checkbox
                checked={draft.autoSaveHistory}
                label={zh ? "分析完成后自动保存报告" : "Save reports automatically after analysis"}
                onChange={(checked) => updateDraft({ autoSaveHistory: checked })}
              />
              <Checkbox
                checked={draft.reopenLastWorkspace}
                label={zh ? "启动时重新打开上次目录" : "Reopen the last folder at startup"}
                onChange={(checked) => updateDraft({ reopenLastWorkspace: checked })}
              />
              <p className="settings-help">
                {zh
                  ? "报告保存在本机，最多保留 50 条。"
                  : "Reports stay on this device; up to 50 are retained."}
              </p>
            </fieldset>
          </div>
        </details>

        {operationError ? (
          <p aria-live="assertive" className="settings-error" role="alert">
            {operationError}
          </p>
        ) : null}

        <div className="settings-actions">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                setSubmitting(true);
                try {
                  await performSettingsOperation({
                    failureMessage: zh
                      ? "无法恢复默认设置，请稍后重试。"
                      : "Could not restore the default settings. Try again.",
                    onSuccess: props.onClose,
                    operation: props.onSettingsReset,
                    setError: setOperationError,
                  });
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
          >
            {zh ? "恢复默认" : "Restore defaults"}
          </button>
          <div className="settings-actions-primary">
            <button type="button" onClick={closeWithoutSaving}>
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              className="primary"
              disabled={submitting}
              type="button"
              onClick={() => {
                void (async () => {
                  setSubmitting(true);
                  try {
                    await performSettingsOperation({
                      failureMessage: zh
                        ? "无法保存设置，请检查填写内容后重试。"
                        : "Could not save settings. Check the entered values and try again.",
                      onSuccess: props.onClose,
                      operation: () => props.onSettingsChange(toSettingsPatch(draft)),
                      setError: setOperationError,
                    });
                  } finally {
                    setSubmitting(false);
                  }
                })();
              }}
            >
              {zh ? "保存设置" : "Save settings"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export function ProviderErrorNotice(props: ProviderErrorNoticeProps) {
  const zh = props.locale === "zh-CN";
  const copy = zh ? chineseProviderErrorCopy[props.error.kind] : undefined;
  return (
    <section className="provider-error">
      <div className="provider-error-header">
        <div>
          <strong>{copy?.title ?? props.error.title}</strong>
          <p>{copy?.summary ?? props.error.summary}</p>
        </div>
      </div>
      <ul>
        {(copy?.suggestions ?? props.error.suggestions).map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
    </section>
  );
}

function Checkbox(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-row">
      <input
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {props.label}
    </label>
  );
}

function SessionKeyInput(props: {
  readonly credentialStatus: CredentialStatus;
  readonly locale: Locale;
  readonly onSave: (apiKey: string) => Promise<SettingsOperationResult>;
  readonly onClear: () => Promise<SettingsOperationResult>;
}) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const zh = props.locale === "zh-CN";
  const status = credentialStatusCopy[props.credentialStatus][props.locale];
  async function handleSave() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await performSettingsOperation({
        failureMessage: zh
          ? "无法启用访问密钥，请重试。"
          : "Could not activate the access key. Try again.",
        onSuccess: () => {
          setApiKeyInput("");
          setSavedFeedback(true);
        },
        operation: () => props.onSave(trimmed),
        setError: setOperationError,
      });
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <label>
      {zh ? "访问密钥" : "Access key"}
      <div className="session-key-row">
        <input
          type="password"
          autoComplete="off"
          placeholder={zh ? "仅用于本次运行" : "Used only for this run"}
          value={apiKeyInput}
          onChange={(event) => {
            setApiKeyInput(event.currentTarget.value);
            setSavedFeedback(false);
            setOperationError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
        <button
          className="primary"
          type="button"
          onClick={() => void handleSave()}
          disabled={submitting || !apiKeyInput.trim()}
        >
          {zh ? "使用" : "Use"}
        </button>
        <button
          disabled={submitting}
          type="button"
          onClick={() => {
            void (async () => {
              setSubmitting(true);
              try {
                await performSettingsOperation({
                  failureMessage: zh
                    ? "无法清除访问密钥，请重试。"
                    : "Could not clear the access key. Try again.",
                  onSuccess: () => setSavedFeedback(false),
                  operation: props.onClear,
                  setError: setOperationError,
                });
              } finally {
                setSubmitting(false);
              }
            })();
          }}
        >
          {zh ? "清除" : "Clear"}
        </button>
      </div>
      <span aria-live="polite" className="settings-help">
        {savedFeedback
          ? zh
            ? "本次运行已启用该密钥。"
            : "The key is active for this run."
          : zh
            ? `当前状态：${status}。密钥仅保留在内存中，不会写入磁盘。`
            : `Current status: ${status}. The key stays in memory and is never written to disk.`}
      </span>
      {operationError ? (
        <span aria-live="assertive" className="settings-error" role="alert">
          {operationError}
        </span>
      ) : null}
    </label>
  );
}

const credentialStatusCopy: Record<CredentialStatus, Record<Locale, string>> = {
  env: { en: "access key available", "zh-CN": "已有可用密钥" },
  none: { en: "no key available", "zh-CN": "尚未提供密钥" },
  session: { en: "access key active", "zh-CN": "正在使用访问密钥" },
};

type LocalizedProviderError = {
  readonly title: string;
  readonly summary: string;
  readonly suggestions: readonly string[];
};
const chineseProviderErrorCopy: Record<ProviderErrorKind, LocalizedProviderError> = {
  "connection-closed": {
    title: "在线分析未完成",
    summary: "本次在线分析未能完成。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "service-unavailable": {
    title: "在线分析暂时不可用",
    summary: "当前无法完成在线分析。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "service-timeout": {
    title: "在线分析暂时不可用",
    summary: "当前无法完成在线分析。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  auth: {
    title: "访问密钥无法使用",
    summary: "在线分析需要有效的访问密钥。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "rate-limit": {
    title: "在线分析暂时不可用",
    summary: "当前无法完成在线分析。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "response-format": {
    title: "在线分析未完成",
    summary: "本次在线分析未能完成。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "invalid-json": {
    title: "在线分析未完成",
    summary: "本次在线分析未能完成。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "strict-output": {
    title: "在线分析未完成",
    summary: "本次在线分析未能完成。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  "missing-key": {
    title: "访问密钥无法使用",
    summary: "在线分析需要有效的访问密钥。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
  unknown: {
    title: "在线分析未完成",
    summary: "本次在线分析未能完成。",
    suggestions: ["检查在线分析设置。", "稍后重试。", "改用离线检查。"],
  },
};

function splitLines(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

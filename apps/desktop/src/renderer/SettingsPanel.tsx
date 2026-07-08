import type { CredentialStatus } from "../desktop-provider.js";
import type { Locale, ReportTemplateId } from "../ipc-contract.js";
import type { ProviderErrorUx } from "../provider-error-ux.js";
import type { DesktopSettings, DesktopSettingsPatch, ProviderMode } from "../settings-model.js";

export interface SettingsPanelProps {
  readonly isOpen: boolean;
  readonly settings: DesktopSettings;
  readonly credentialStatus: CredentialStatus;
  readonly onClose: () => void;
  readonly onSettingsChange: (patch: DesktopSettingsPatch) => void;
  readonly onSettingsReset: () => void;
  readonly onSaveSessionApiKey: (apiKey: string) => void;
  readonly onClearSessionApiKey: () => void;
}

export interface ProviderErrorNoticeProps {
  readonly error: ProviderErrorUx;
  readonly onOpenSettings: () => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  if (!props.isOpen) return null;
  return (
    <section className="settings-panel" aria-label="Settings">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>GUI settings center</h2>
        </div>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>

      <fieldset>
        <legend>Provider</legend>
        <label>
          Provider mode
          <select
            value={props.settings.providerMode}
            onChange={(event) =>
              props.onSettingsChange({ providerMode: event.currentTarget.value as ProviderMode })
            }
          >
            <option value="mock">Deterministic mock</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
        </label>
        <p className="settings-help">
          Mock mode never reads keys. OpenAI-compatible mode uses a session key first, then
          OPENAI_API_KEY. Applies to the next Analyze.
        </p>
        <label>
          Base URL
          <input
            value={props.settings.providerBaseUrl}
            onChange={(event) =>
              props.onSettingsChange({ providerBaseUrl: event.currentTarget.value })
            }
            placeholder="Default OpenAI-compatible endpoint"
          />
        </label>
        <label>
          Model
          <input
            value={props.settings.providerModel}
            onChange={(event) =>
              props.onSettingsChange({ providerModel: event.currentTarget.value })
            }
            placeholder="Use environment or provider default"
          />
        </label>
        <label className="checkbox-row">
          <input
            checked={props.settings.structuredOutputStrict}
            onChange={(event) =>
              props.onSettingsChange({ structuredOutputStrict: event.currentTarget.checked })
            }
            type="checkbox"
          />
          Structured output strict
        </label>
        <SessionKeyInput
          credentialStatus={props.credentialStatus}
          onClear={props.onClearSessionApiKey}
          onSave={props.onSaveSessionApiKey}
        />
      </fieldset>

      <fieldset>
        <legend>Analysis</legend>
        <label>
          topK
          <input
            min={1}
            type="number"
            value={props.settings.topK}
            onChange={(event) =>
              props.onSettingsChange({ topK: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          Ignore paths
          <textarea
            rows={4}
            value={props.settings.ignore.join("\n")}
            onChange={(event) =>
              props.onSettingsChange({ ignore: splitLines(event.currentTarget.value) })
            }
          />
        </label>
        <label className="checkbox-row">
          <input
            checked={props.settings.confirmRequirementDecomposition}
            onChange={(event) =>
              props.onSettingsChange({
                confirmRequirementDecomposition: event.currentTarget.checked,
              })
            }
            type="checkbox"
          />
          Show requirement decomposition before analysis
        </label>
      </fieldset>

      <fieldset>
        <legend>Presentation</legend>
        <div className="switch-row">
          <label>
            Locale
            <select
              value={props.settings.locale}
              onChange={(event) =>
                props.onSettingsChange({ locale: event.currentTarget.value as Locale })
              }
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Template
            <select
              value={props.settings.templateId}
              onChange={(event) =>
                props.onSettingsChange({
                  templateId: event.currentTarget.value as ReportTemplateId,
                })
              }
            >
              <option value="generic">generic</option>
              <option value="todo">todo</option>
              <option value="frontend">frontend</option>
            </select>
          </label>
        </div>
        <label className="checkbox-row">
          <input
            checked={props.settings.showDebugSections}
            onChange={(event) =>
              props.onSettingsChange({ showDebugSections: event.currentTarget.checked })
            }
            type="checkbox"
          />
          Show debug sections
        </label>
        <p className="settings-help">Locale, template, and debug display update immediately.</p>
      </fieldset>

      <fieldset>
        <legend>Workspace and history</legend>
        <label>
          Default workspace dir
          <input
            value={props.settings.defaultWorkspaceDir ?? ""}
            onChange={(event) =>
              props.onSettingsChange({ defaultWorkspaceDir: event.currentTarget.value || null })
            }
          />
        </label>
        <label className="checkbox-row">
          <input
            checked={props.settings.autoSaveHistory}
            onChange={(event) =>
              props.onSettingsChange({ autoSaveHistory: event.currentTarget.checked })
            }
            type="checkbox"
          />
          Auto-save history after analysis
        </label>
        <label className="checkbox-row">
          <input
            checked={props.settings.reopenLastWorkspace}
            onChange={(event) =>
              props.onSettingsChange({ reopenLastWorkspace: event.currentTarget.checked })
            }
            type="checkbox"
          />
          Reopen last workspace
        </label>
      </fieldset>

      <button type="button" onClick={props.onSettingsReset}>
        Reset non-sensitive settings
      </button>
    </section>
  );
}

export function ProviderErrorNotice(props: ProviderErrorNoticeProps) {
  return (
    <section className="provider-error" data-kind={props.error.kind}>
      <div className="provider-error-header">
        <div>
          <strong>{props.error.title}</strong>
          <p>{props.error.summary}</p>
        </div>
        <button type="button" onClick={props.onOpenSettings}>
          Open Settings
        </button>
      </div>
      <ul>
        {props.error.suggestions.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
      <details>
        <summary>Technical details</summary>
        <pre>{props.error.technicalDetail}</pre>
      </details>
    </section>
  );
}

function SessionKeyInput(props: {
  readonly credentialStatus: CredentialStatus;
  readonly onSave: (apiKey: string) => void;
  readonly onClear: () => void;
}) {
  return (
    <label>
      Session-only API key
      <input
        type="password"
        placeholder="Paste key for this app session only"
        onChange={(event) => props.onSave(event.currentTarget.value)}
      />
      <span className="settings-help">
        Current credential status: {props.credentialStatus}. This key is kept in memory for this app
        session only and is not written to disk.
      </span>
      <button type="button" onClick={props.onClear}>
        Clear session key
      </button>
    </label>
  );
}

function splitLines(value: string): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of value.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

import { useMemo, useState } from "react";
import type { DecomposeItem, DecomposeResponse, Locale } from "../ipc-contract.js";

export interface DecompositionReviewPanelProps {
  readonly decomposition: DecomposeResponse;
  readonly locale: Locale;
  readonly onConfirm: (decomposition: DecomposeResponse) => void;
  readonly onCancel: () => void;
  readonly onRestart: () => void;
}

export function normalizeEditedDecomposition(
  decomposition: DecomposeResponse,
): DecomposeResponse | undefined {
  const requirements = normalizeItems(decomposition.requirements, "REQ");
  if (requirements.length === 0) return undefined;
  return {
    ...decomposition,
    requirements,
    claims: normalizeItems(decomposition.claims, "CLAIM"),
  };
}

export function DecompositionReviewPanel(props: DecompositionReviewPanelProps) {
  const [draft, setDraft] = useState(props.decomposition);
  const normalized = useMemo(() => normalizeEditedDecomposition(draft), [draft]);
  const zh = props.locale === "zh-CN";

  function updateItems(key: "requirements" | "claims", items: readonly DecomposeItem[]) {
    setDraft((current) => ({ ...current, [key]: items }));
  }

  return (
    <section className="decomposition-review" aria-labelledby="decomposition-title">
      <div className="decomposition-header">
        <p className="eyebrow">{zh ? "确认检查内容" : "Confirm what to check"}</p>
        <h2 id="decomposition-title">
          {zh ? "检查需求与完成声明" : "Review requirements and claims"}
        </h2>
        <p>
          {zh
            ? "可直接修改、添加或删除条目。正式分析将使用这里确认的内容。"
            : "Edit, add, or remove items. The analysis will use the content confirmed here."}
        </p>
      </div>

      <div className="decomposition-grid">
        <EditableList
          items={draft.requirements}
          kind="REQ"
          locale={props.locale}
          onChange={(items) => updateItems("requirements", items)}
          title={zh ? "需求" : "Requirements"}
        />
        <EditableList
          items={draft.claims}
          kind="CLAIM"
          locale={props.locale}
          onChange={(items) => updateItems("claims", items)}
          title={zh ? "完成声明（可选）" : "Completion claims (optional)"}
        />
      </div>

      <ReadOnlyList
        title={zh ? "分析假设" : "Assumptions"}
        items={draft.assumptions}
        locale={props.locale}
      />
      <ReadOnlyList
        title={zh ? "需要澄清" : "Questions to clarify"}
        items={draft.clarifyingQuestions}
        locale={props.locale}
      />
      {draft.clarifyingQuestions.length > 0 && (
        <p className="decomposition-guidance">
          {zh
            ? "如需补充答案，请返回修改原始需求，然后重新识别检查内容。"
            : "To answer these questions, update the original requirement and review the detected items again."}
        </p>
      )}
      <ReadOnlyList
        title={zh ? "注意事项" : "Warnings"}
        items={
          draft.warnings.length === 0
            ? []
            : [
                zh
                  ? "部分内容可能需要补充说明后再分析。"
                  : "Some items may need more detail before analysis.",
              ]
        }
        locale={props.locale}
      />

      {normalized === undefined && (
        <p className="field-error" role="alert">
          {zh ? "至少保留一条非空需求。" : "Keep at least one non-empty requirement."}
        </p>
      )}
      <div className="decomposition-actions">
        <button
          className="primary"
          disabled={normalized === undefined}
          type="button"
          onClick={() => normalized && props.onConfirm(normalized)}
        >
          {zh ? "确认并分析" : "Confirm and analyze"}
        </button>
        <button className="secondary" type="button" onClick={props.onRestart}>
          {zh ? "重新识别" : "Review updated requirement"}
        </button>
        <button className="danger" type="button" onClick={props.onCancel}>
          {zh ? "取消" : "Cancel"}
        </button>
      </div>
    </section>
  );
}

function EditableList(props: {
  readonly items: readonly DecomposeItem[];
  readonly kind: "REQ" | "CLAIM";
  readonly locale: Locale;
  readonly onChange: (items: readonly DecomposeItem[]) => void;
  readonly title: string;
}) {
  const zh = props.locale === "zh-CN";
  return (
    <fieldset className="decomposition-section">
      <legend>{props.title}</legend>
      {props.items.map((item, index) => (
        <div className="decomposition-edit-row" key={item.id}>
          <label>
            <span className="sr-only">
              {props.title} {index + 1}
            </span>
            <textarea
              rows={2}
              value={item.text}
              onChange={(event) =>
                props.onChange(
                  props.items.map((current, currentIndex) =>
                    currentIndex === index
                      ? { ...current, text: event.currentTarget.value }
                      : current,
                  ),
                )
              }
            />
          </label>
          <button
            className="danger quiet"
            type="button"
            onClick={() =>
              props.onChange(props.items.filter((_, currentIndex) => currentIndex !== index))
            }
          >
            {zh ? "删除" : "Remove"}
          </button>
        </div>
      ))}
      <button
        className="secondary"
        type="button"
        onClick={() =>
          props.onChange([...props.items, { id: nextItemId(props.items, props.kind), text: "" }])
        }
      >
        {zh ? "添加一条" : "Add item"}
      </button>
    </fieldset>
  );
}

function ReadOnlyList(props: {
  readonly title: string;
  readonly items: readonly string[];
  readonly locale: Locale;
}) {
  return (
    <div className="decomposition-section">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="decomposition-empty">{props.locale === "zh-CN" ? "无" : "None"}</p>
      ) : (
        <ul>
          {props.items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function normalizeItems(items: readonly DecomposeItem[], prefix: "REQ" | "CLAIM"): DecomposeItem[] {
  return items
    .flatMap((item) => {
      const text = item.text.trim();
      return text.length === 0 ? [] : [{ id: item.id, text }];
    })
    .map((item, index) => ({ ...item, id: `${prefix}-${index + 1}` }));
}

function nextItemId(items: readonly DecomposeItem[], prefix: "REQ" | "CLAIM"): string {
  return `${prefix}-${items.length + 1}-${crypto.randomUUID()}`;
}

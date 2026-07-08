import type { DecomposeResponse } from "../ipc-contract.js";

export interface DecompositionReviewPanelProps {
  readonly decomposition: DecomposeResponse;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DecompositionReviewPanel(props: DecompositionReviewPanelProps) {
  const { decomposition } = props;
  return (
    <section className="decomposition-review" aria-label="Requirement decomposition review">
      <div className="decomposition-header">
        <p className="eyebrow">Decomposition review</p>
        <h2>确认拆分后的需求与声明</h2>
        <p>请确认以下 decomposition 结果，确认后将进入正式分析。</p>
      </div>

      <div className="decomposition-grid">
        <DecompositionList
          emptyHint="未拆分出任何需求。"
          items={decomposition.requirements}
          title="Requirements"
        />
        <DecompositionList
          emptyHint="未拆分出任何声明。"
          items={decomposition.claims}
          title="Claims"
        />
      </div>

      <DecompositionStringList
        emptyHint="无假设。"
        items={decomposition.assumptions}
        title="Assumptions"
      />
      <DecompositionStringList
        emptyHint="无澄清问题。"
        items={decomposition.clarifyingQuestions}
        title="Clarifying questions"
      />
      <DecompositionStringList
        emptyHint="无警告。"
        items={decomposition.warnings}
        title="Warnings"
      />

      <div className="decomposition-actions">
        <button type="button" onClick={props.onConfirm}>
          Confirm
        </button>
        <button className="danger" type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

interface DecompositionListProps {
  readonly title: string;
  readonly emptyHint: string;
  readonly items: readonly { readonly id: string; readonly text: string }[];
}

function DecompositionList(props: DecompositionListProps) {
  return (
    <div className="decomposition-section">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="decomposition-empty">{props.emptyHint}</p>
      ) : (
        <ul>
          {props.items.map((item) => (
            <li key={item.id}>
              <strong>{item.id}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface DecompositionStringListProps {
  readonly title: string;
  readonly emptyHint: string;
  readonly items: readonly string[];
}

function DecompositionStringList(props: DecompositionStringListProps) {
  return (
    <div className="decomposition-section">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="decomposition-empty">{props.emptyHint}</p>
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

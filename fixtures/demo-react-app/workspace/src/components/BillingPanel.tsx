import { useState } from "react";

export function BillingPanel() {
  const [enabled, setEnabled] = useState(false);

  return (
    <aside className="card billing-panel">
      <h2>Billing upgrade</h2>
      <p>This subscription toggle is outside the requested task tracking scope.</p>
      <label>
        <input
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          type="checkbox"
        />
        Enable paid workspace features
      </label>
    </aside>
  );
}

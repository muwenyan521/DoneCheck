export function ExportButton() {
  function handleExport() {
    alert("Export is not implemented yet");
  }

  return (
    <section className="card">
      <h2>CSV export</h2>
      <p>Download the current todo list for offline review.</p>
      <button onClick={handleExport} type="button">
        Export CSV
      </button>
    </section>
  );
}

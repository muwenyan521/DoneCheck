import { type FormEvent, useState } from "react";

interface TodoItem {
  readonly id: string;
  readonly text: string;
}

export function TodoList() {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<TodoItem[]>([{ id: "seed", text: "Review DoneCheck report" }]);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    setItems((current) => [...current, { id: crypto.randomUUID(), text }]);
    setDraft("");
  }

  function persistTodos() {
    localStorage.setItem("donecheck:todos", JSON.stringify(items));
  }

  return (
    <section className="card">
      <h2>Todos</h2>
      <form onSubmit={handleAdd}>
        <input
          aria-label="New todo"
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="Add a todo"
          value={draft}
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      <button onClick={persistTodos} type="button">
        Save locally
      </button>
    </section>
  );
}

import { type FormEvent, useState } from "react";

type Todo = { id: number; text: string };

export function TodoApp() {
  const [draft, setDraft] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    setTodos((items) => [...items, { id: Date.now(), text }]);
    setDraft("");
  }

  function handleDelete(id: number) {
    setTodos((items) => items.filter((todo) => todo.id !== id));
  }

  const handleComplete = () => {};

  return (
    <section>
      <h2>Todos</h2>
      <form onSubmit={handleAdd}>
        <input onChange={(event) => setDraft(event.currentTarget.value)} value={draft} />
        <button type="submit">Add todo</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            {todo.text}
            <button onClick={handleComplete} type="button">
              Complete
            </button>
            <button onClick={() => handleDelete(todo.id)} type="button">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

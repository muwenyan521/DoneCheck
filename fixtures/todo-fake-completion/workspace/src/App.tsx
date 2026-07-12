import { ExportButton } from "./components/ExportButton";
import { LoginPage } from "./components/LoginPage";
import { TodoApp } from "./components/TodoApp";
import "./styles.css";

export function App() {
  return (
    <main className="todo-app">
      <LoginPage />
      <TodoApp />
      <ExportButton />
    </main>
  );
}

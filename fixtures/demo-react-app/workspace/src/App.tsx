import { BillingPanel } from "./components/BillingPanel";
import { ExportButton } from "./components/ExportButton";
import { LoginForm } from "./components/LoginForm";
import { TodoList } from "./components/TodoList";
import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <h1>DoneCheck Demo Tasks</h1>
        <p>Track implementation claims against real React code.</p>
      </section>
      <LoginForm />
      <TodoList />
      <ExportButton />
      <BillingPanel />
    </main>
  );
}

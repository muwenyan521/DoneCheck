import { type FormEvent, useState } from "react";
import { createAuthSession } from "../lib/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Signed out");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = createAuthSession({ email, password });
    localStorage.setItem("donecheck:auth-session", JSON.stringify(session));
    setMessage(`Signed in as ${session.email}`);
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Email login</h2>
      <label>
        Email
        <input onChange={(e) => setEmail(e.currentTarget.value)} type="email" value={email} />
      </label>
      <label>
        Password
        <input
          onChange={(e) => setPassword(e.currentTarget.value)}
          type="password"
          value={password}
        />
      </label>
      <button type="submit">Sign in</button>
      <output>{message}</output>
    </form>
  );
}

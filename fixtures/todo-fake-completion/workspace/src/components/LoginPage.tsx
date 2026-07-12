import { type FormEvent, useState } from "react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Signed out");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@") || password.length < 8) {
      setMessage("Enter a valid email and password");
      return;
    }
    const authenticatedEmail = email;
    setMessage(`Signed in as ${authenticatedEmail}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login</h1>
      <input onChange={(event) => setEmail(event.currentTarget.value)} type="email" value={email} />
      <input
        onChange={(event) => setPassword(event.currentTarget.value)}
        type="password"
        value={password}
      />
      <button type="submit">Sign in</button>
      <output>{message}</output>
    </form>
  );
}

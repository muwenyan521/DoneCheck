export function persistAuthenticatedSession(userId: string) {
  return localStorage.setItem("authenticated-user", userId);
}

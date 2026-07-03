export interface AuthInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthSession {
  readonly email: string;
  readonly token: string;
}

export function createAuthSession(input: AuthInput): AuthSession {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new Error("A valid email is required");
  }
  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  return {
    email: normalizedEmail,
    token: `auth-${normalizedEmail}-${input.password.length}`,
  };
}

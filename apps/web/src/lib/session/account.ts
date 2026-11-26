import { type ApiResult, apiRequest } from "@/lib/api/client";
import { type Account } from "./session-store";

/** The user as the API's register and login return it. */
type ApiUser = { id: string; name?: string; role: Account["roles"][number] };

/** What register and login answer: a bearer token and the user it belongs to. */
type AuthResponse = { token: string; user: ApiUser; family?: { id: string } };

/** A token, the account it signs in, and the parent's name to greet them with. */
export type SignedInAccount = { token: string; account: Account; name?: string };

function toSignedIn({ token, user, family }: AuthResponse): SignedInAccount {
  return {
    token,
    account: { userId: user.id, roles: [user.role], familyId: family?.id ?? null },
    name: user.name,
  };
}

/** Signs a parent in with email and password (POST /api/v1/auth/login). */
export async function logIn(email: string, password: string): Promise<ApiResult<SignedInAccount>> {
  const result = await apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return result.ok ? { ok: true, data: toSignedIn(result.data) } : result;
}

/** What a new parent sends to register. */
export type NewParent = {
  name: string;
  email: string;
  password: string;
  /** The version of the terms and privacy policy the parent accepted. The API requires it. */
  policyVersion: string;
  /** Optional: a two-letter country code (ISO 3166-1), such as "JO". */
  country?: string;
};

/**
 * Creates a parent account and its family (POST /api/v1/auth/register). The API then emails a
 * link to verify the address; until then, the parent cannot add a child.
 */
export async function register(parent: NewParent): Promise<ApiResult<SignedInAccount>> {
  const result = await apiRequest<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: parent,
  });
  return result.ok ? { ok: true, data: toSignedIn(result.data) } : result;
}

import { type ApiResult, apiRequest } from "@/lib/api/client";
import { type Account } from "./session-store";

/** The user as the API's register and login return it. */
type ApiUser = { id: string; role: Account["roles"][number] };

/** What register and login answer: a bearer token and the user it belongs to. */
type AuthResponse = { token: string; user: ApiUser; family?: { id: string } };

/** A token and the account it signs in. */
export type SignedInAccount = { token: string; account: Account };

function toSignedIn({ token, user, family }: AuthResponse): SignedInAccount {
  return { token, account: { userId: user.id, roles: [user.role], familyId: family?.id ?? null } };
}

/** Signs a parent in with email and password (POST /api/v1/auth/login). */
export async function logIn(email: string, password: string): Promise<ApiResult<SignedInAccount>> {
  const result = await apiRequest<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return result.ok ? { ok: true, data: toSignedIn(result.data) } : result;
}

/** Creates a parent account and its family (POST /api/v1/auth/register). */
export async function register(
  name: string,
  email: string,
  password: string,
): Promise<ApiResult<SignedInAccount>> {
  const result = await apiRequest<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: { name, email, password },
  });
  return result.ok ? { ok: true, data: toSignedIn(result.data) } : result;
}

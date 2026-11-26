import { type ApiResult, apiRequest } from "@/lib/api/client";

/** A child profile as the screens use it. */
export type ChildProfile = {
  id: string;
  displayName: string;
  hasPin: boolean;
};

/**
 * What Add Child sends: the API needs a name and the full date of birth (YYYY-MM-DD); the home
 * language and interests are optional.
 */
export type NewChild = {
  name: string;
  dateOfBirth: string;
  homeLanguage?: HomeLanguage;
  interests?: string[];
};

/** A child as the API returns it; only the fields the screens use. */
type ApiChild = { id: string; name: string; hasPin?: boolean };

// The API has no PIN endpoints yet (open decision O-03 in the CRS), so `hasPin` is false until it
// sends the field, and G08 shows its "no PIN" state.
function toChildProfile(child: ApiChild): ChildProfile {
  return { id: child.id, displayName: child.name, hasPin: child.hasPin === true };
}

/** Outcome of checking a child's PIN on the profile picker (G08). */
export type PinCheck = "accepted" | "wrong-pin" | "locked" | "no-pin" | "failed";

/** The family's children (GET /api/v1/children). */
export async function listChildren(token: string): Promise<ApiResult<ChildProfile[]>> {
  const result = await apiRequest<{ children: ApiChild[] }>("/api/v1/children", { token });
  return result.ok ? { ok: true, data: result.data.children.map(toChildProfile) } : result;
}

/** Adds a child to the signed-in parent's family (POST /api/v1/children). */
export async function createChild(
  token: string,
  child: NewChild,
): Promise<ApiResult<ChildProfile>> {
  const result = await apiRequest<{ child: ApiChild }>("/api/v1/children", {
    method: "POST",
    token,
    body: child,
  });
  return result.ok ? { ok: true, data: toChildProfile(result.data.child) } : result;
}

/** The API's age bands (6–8, 9–11, 12–14). It works the band out from the date of birth. */
export type AgeBand = "6-8" | "9-11" | "12-14";

/** The language spoken at home, as the API stores it. */
export type HomeLanguage = "ar" | "en";

/** A child as the parent dashboard shows it. */
export type ChildDetails = {
  id: string;
  name: string;
  /** YYYY-MM-DD, as a date input gives it. */
  dateOfBirth: string;
  ageBand?: AgeBand;
  homeLanguage: HomeLanguage;
  interests: string[];
  /** A child is `pending_consent` until the parent's consent is recorded. */
  status: "pending_consent" | "active" | "archived";
};

type ApiChildDetails = {
  id: string;
  name: string;
  dateOfBirth: string;
  ageBand?: AgeBand;
  homeLanguage?: HomeLanguage;
  interests?: string[];
  status: ChildDetails["status"];
};

function toChildDetails(child: ApiChildDetails): ChildDetails {
  return {
    id: child.id,
    name: child.name,
    // The API sends a full timestamp at midnight UTC.
    dateOfBirth: child.dateOfBirth.slice(0, 10),
    ageBand: child.ageBand,
    homeLanguage: child.homeLanguage ?? "ar",
    interests: child.interests ?? [],
    status: child.status,
  };
}

/** The family's children with the fields the dashboard shows (GET /api/v1/children). */
export async function listChildDetails(token: string): Promise<ApiResult<ChildDetails[]>> {
  const result = await apiRequest<{ children: ApiChildDetails[] }>("/api/v1/children", { token });
  return result.ok ? { ok: true, data: result.data.children.map(toChildDetails) } : result;
}

/** What the parent can change on the child profile. */
export type ChildChanges = Partial<
  Pick<ChildDetails, "name" | "dateOfBirth" | "homeLanguage" | "interests">
>;

/** Saves changes to a child's profile (PATCH /api/v1/children/:id). */
export async function updateChild(
  token: string,
  childId: string,
  changes: ChildChanges,
): Promise<ApiResult<ChildDetails>> {
  const result = await apiRequest<{ child: ApiChildDetails }>(
    `/api/v1/children/${encodeURIComponent(childId)}`,
    { method: "PATCH", token, body: changes },
  );
  return result.ok ? { ok: true, data: toChildDetails(result.data.child) } : result;
}

/** What G08 shows for the API's answer to a PIN check. */
export function toPinCheck(result: ApiResult<unknown>): PinCheck {
  if (result.ok) return "accepted";
  // Repeated wrong PINs lock the profile (FR-AUTH-002). The API has no PIN endpoints yet, so the
  // status (423) and the error codes below follow the earlier API and may change with it.
  if (result.error.kind === "locked") return "locked";
  if (result.error.code === "invalid_pin") return "wrong-pin";
  if (result.error.code === "pin_not_set") return "no-pin";
  return "failed";
}

/** Checks a child's PIN on the server; the browser never keeps it. */
export async function verifyChildPin(
  token: string,
  childId: string,
  pin: string,
): Promise<PinCheck> {
  const result = await apiRequest<{ ok: true }>(`/api/v1/children/${childId}/pin/verify`, {
    method: "POST",
    token,
    body: { pin },
  });
  return toPinCheck(result);
}

import { type ApiResult, apiRequest } from "@/lib/api/client";

// The family loop (FR-FAM-001 to FR-FAM-003, API-005): after a lesson, the child gets a home
// mission; the parent says how it went (an observation). Only the fields the screens use.

/** What a parent saw: on their own, after a reminder, or not yet. The API's own values. */
export const OBSERVATIONS = ["independent", "reminder", "not_observed"] as const;
export type Observation = (typeof OBSERVATIONS)[number];

/** The longest note the API keeps with an observation. */
export const NOTE_MAX_LENGTH = 500;

/** open (waiting for the parent), done (observed) or ended (not observed in time). */
export type MissionStatus = "pending" | "completed" | "expired";

export type FamilyMission = {
  /** The assignment's id: the parent observes this. */
  id: string;
  status: MissionStatus;
  title: string;
  description: string;
  estimatedMinutes?: number;
  observation?: { status: Observation; note?: string };
};

type ApiMission = {
  id: string;
  status: MissionStatus;
  mission: { title: string; description?: string; estimatedMinutes?: number } | null;
  observation: { status: Observation; note?: string } | null;
};

function toFamilyMission(item: ApiMission): FamilyMission {
  return {
    id: item.id,
    status: item.status,
    title: item.mission?.title ?? "",
    description: item.mission?.description ?? "",
    estimatedMinutes: item.mission?.estimatedMinutes,
    observation: item.observation ?? undefined,
  };
}

/** A child's missions, newest first (GET /api/v1/children/:id/missions). */
export async function listMissions(
  token: string,
  childId: string,
): Promise<ApiResult<FamilyMission[]>> {
  const result = await apiRequest<{ missions: ApiMission[] }>(
    `/api/v1/children/${encodeURIComponent(childId)}/missions`,
    { token },
  );
  return result.ok
    ? {
        ok: true,
        // A mission whose content was removed has no title, so it cannot be shown.
        data: result.data.missions.filter((item) => item.mission).map(toFamilyMission),
      }
    : result;
}

export type NewObservation = {
  status: Observation;
  note?: string;
  /** Made once per answer, so sending it again (after a lost reply) saves it only once. */
  clientObservationId: string;
};

/** Saves the parent's observation (POST /api/v1/children/:id/missions/:assignmentId/observe). */
export function observeMission(
  token: string,
  childId: string,
  missionId: string,
  observation: NewObservation,
): Promise<ApiResult<unknown>> {
  return apiRequest<unknown>(
    `/api/v1/children/${encodeURIComponent(childId)}/missions/${encodeURIComponent(missionId)}/observe`,
    { method: "POST", token, body: observation },
  );
}

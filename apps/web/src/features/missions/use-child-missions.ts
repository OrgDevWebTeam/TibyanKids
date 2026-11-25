import { useCallback, useEffect, useState } from "react";
import { getSession } from "@/lib/session/session-store";
import { type FamilyMission, listMissions, observeMission, type Observation } from "./missions-api";

export type MissionsState =
  { status: "loading" } | { status: "failed" } | { status: "ready"; missions: FamilyMission[] };

export type ObservationAnswer = {
  status: Observation;
  note?: string;
  clientObservationId: string;
};

/**
 * A child's missions and the parent's observations (P03, FR-FAM-002), for Family Tasks and the
 * dashboard's Today's tasks. `savedText` is announced to screen readers after an answer is saved.
 */
export function useChildMissions(childId: string, savedText: string) {
  const [state, setState] = useState<MissionsState>({ status: "loading" });
  const [announcement, setAnnouncement] = useState("");

  const reload = useCallback(async () => {
    const session = getSession();
    if (session.status !== "signed-in") return;
    setState({ status: "loading" });
    const result = await listMissions(session.token, childId);
    setState(result.ok ? { status: "ready", missions: result.data } : { status: "failed" });
  }, [childId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const observe = useCallback(
    async (mission: FamilyMission, answer: ObservationAnswer): Promise<boolean> => {
      const session = getSession();
      if (session.status !== "signed-in") return false;
      setAnnouncement("");
      const result = await observeMission(session.token, childId, mission.id, answer);
      if (!result.ok) return false;
      // The mission is done: show it with the answer, without loading the list again.
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              missions: current.missions.map((item) =>
                item.id === mission.id
                  ? {
                      ...item,
                      status: "completed",
                      observation: { status: answer.status, note: answer.note },
                    }
                  : item,
              ),
            }
          : current,
      );
      setAnnouncement(savedText);
      return true;
    },
    [childId, savedText],
  );

  return { state, announcement, reload, observe };
}

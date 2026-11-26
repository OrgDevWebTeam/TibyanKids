import { useOutletContext } from "react-router";
import { type ChildDetails } from "@/features/children/children-api";

/**
 * What the dashboard frame gives its pages: the family's children (youngest first), the one chosen
 * in the sidebar (none before the first child is added) and a way to choose one. The choice stays
 * in memory, never in the address (privacy rules).
 */
export type DashboardContext = {
  kids: ChildDetails[];
  child?: ChildDetails;
  selectChild: (childId: string) => void;
};

export function useDashboard(): DashboardContext {
  return useOutletContext<DashboardContext>();
}

/**
 * The child chosen in the sidebar, for the pages about one child. The frame's loader sends a
 * family without children to Add Child, so these pages always have one.
 */
export function useSelectedChild(): ChildDetails {
  const { child } = useDashboard();
  if (!child) throw new Error("A child page opened without a child");
  return child;
}

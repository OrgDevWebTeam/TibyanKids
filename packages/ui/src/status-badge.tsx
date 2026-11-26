import { type ReactNode } from "react";
import { cx } from "./cx";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

// Utility/Tag: a tint background with the deep text shade of the same tone.
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  info: "bg-info-tint text-info",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
};

/** A different shape per tone, so the status never depends on colour alone (NFR-A11Y-001). */
function StatusIcon({ tone }: { tone: StatusTone }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true } as const;
  switch (tone) {
    case "info":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5" fill="currentColor" />
        </svg>
      );
    case "success":
      return (
        <svg {...common}>
          <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M6 1l5.5 10H.5z" fill="currentColor" />
        </svg>
      );
    case "danger":
      return (
        <svg {...common}>
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "neutral":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export type StatusBadgeProps = { tone?: StatusTone; children: ReactNode };

/**
 * A short static status label, e.g. "pending review" on a recitation (UI spec: status badge;
 * design system: Utility/Tag). Not interactive. Caption text, with an icon so the meaning never
 * depends on colour.
 */
export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium",
        TONE_CLASSES[tone],
      )}
    >
      <StatusIcon tone={tone} />
      {children}
    </span>
  );
}

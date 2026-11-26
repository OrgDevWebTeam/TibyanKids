import { type ReactNode } from "react";
import { cx } from "./cx";
import { CircleCheckIcon, CircleXIcon, InfoIcon, TriangleAlertIcon } from "./icons";

export type BannerTone = "info" | "success" | "warning" | "danger";

// Feedback/Alert: the border and the start accent in the tone's bright fill, the title in its
// deep text shade, and an icon with its own shape per tone, so the type never depends on colour.
const TONES: Record<BannerTone, { box: string; badge: string; title: string; icon: ReactNode }> = {
  info: {
    box: "border-info-fill",
    badge: "bg-info-fill",
    title: "text-info",
    icon: <InfoIcon className="size-5" />,
  },
  success: {
    box: "border-success-fill",
    badge: "bg-success-fill",
    title: "text-success",
    icon: <CircleCheckIcon className="size-5" />,
  },
  warning: {
    box: "border-warning-fill",
    badge: "bg-warning-fill",
    title: "text-warning",
    icon: <TriangleAlertIcon className="size-5" />,
  },
  danger: {
    box: "border-danger-fill",
    badge: "bg-danger-fill",
    title: "text-danger",
    icon: <CircleXIcon className="size-5" />,
  },
};

export type AlertBannerProps = {
  tone?: BannerTone;
  title?: string;
  children: ReactNode;
  /** An optional action, such as a link or a button; links show as underlined text links. */
  action?: ReactNode;
};

/**
 * A message that stays on the page, such as "you are offline" (X06), from the design system's
 * Feedback/Alert. Warnings and errors interrupt screen readers (role="alert"); others wait
 * (role="status").
 */
export function AlertBanner({ tone = "info", title, children, action }: AlertBannerProps) {
  const urgent = tone === "danger" || tone === "warning";
  const style = TONES[tone];

  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-control border border-s-4 bg-surface p-4 text-ink",
        "shadow-[0_1px_3px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]",
        style.box,
      )}
    >
      <span
        aria-hidden="true"
        className={cx("grid size-8 shrink-0 place-items-center rounded-full text-ink", style.badge)}
      >
        {style.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {title && <p className={cx("leading-button font-bold", style.title)}>{title}</p>}
        <div>{children}</div>
        {action && (
          <div className="leading-6 font-bold text-link [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

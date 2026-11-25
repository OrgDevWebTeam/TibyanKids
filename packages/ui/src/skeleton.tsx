import { cx } from "./cx";

// Utility/Skeleton: a light band sweeps across the placeholder in 800ms, in the reading direction
// (right to left in Arabic). With reduced motion the block stays still.
const SHIMMER = cx(
  "bg-surface-muted",
  "motion-safe:bg-[linear-gradient(90deg,var(--tibyan-surface-muted)_25%,var(--tibyan-surface)_50%,var(--tibyan-surface-muted)_75%)]",
  "motion-safe:bg-[length:200%_100%] motion-safe:animate-shimmer rtl:[--shimmer-dir:-1]",
);

/**
 * A placeholder shape while content loads, instead of a blank screen (X06). Hidden from screen
 * readers; the page announces loading itself, once.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("rounded-control", SHIMMER, className)} />;
}

/** A few text-like lines; the last one is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cx("h-4 rounded", SHIMMER, index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

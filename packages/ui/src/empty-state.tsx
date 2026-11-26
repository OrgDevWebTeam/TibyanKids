import { type ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** One action, usually a Button, that says what to do next. */
  action?: ReactNode;
  /** A decorative icon (a Lucide icon) shown in a tinted circle above the title. */
  icon?: ReactNode;
  /** Use 1 when the message is the whole page, such as a 404. */
  headingLevel?: 1 | 2 | 3;
};

/**
 * A calm message for "nothing here yet", errors and other states (X06), from the design
 * system's Utility/Empty state: centred, with an optional icon, a title, one sentence and one
 * action. The copy must stay supportive and never blame the child or parent (UI spec).
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-button bg-surface p-8 text-center text-ink">
      {icon && (
        <span
          aria-hidden="true"
          className="grid size-18 place-items-center rounded-full bg-secondary text-on-secondary [&_svg]:size-12"
        >
          {icon}
        </span>
      )}
      <Heading className="text-2xl leading-8 font-bold">{title}</Heading>
      {description && <p className="text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

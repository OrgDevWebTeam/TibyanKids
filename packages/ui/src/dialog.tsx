import { type ReactNode, useEffect, useId, useRef } from "react";
import { cx } from "./cx";
import { CloseIcon } from "./icons";

export type DialogProps = {
  open: boolean;
  /** Runs when the dialog closes, including on Escape and the close button. Set `open` to false. */
  onClose: () => void;
  title: string;
  /** Accessible name of the close button ("Close"), in the page language. */
  closeLabel: string;
  children: ReactNode;
  /** The actions: a Ghost button, then the Primary one, each naming what it does. */
  actions?: ReactNode;
};

/**
 * Modal dialog from the design system's Feedback/Modal, built on the native <dialog> element.
 * The browser moves focus to the first control, makes the page behind it inert, closes it on
 * Escape and returns focus to the control that opened it, so no focus-trap code is needed.
 */
export function Dialog({ open, onClose, title, closeLabel, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={cx(
        "m-auto w-[min(30rem,calc(100%-2rem))] rounded-dialog border-0 bg-surface p-0 text-ink",
        "shadow-[0_24px_48px_-8px_color-mix(in_srgb,var(--tibyan-shadow)_18%,transparent),0_4px_12px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]",
        "backdrop:bg-[color-mix(in_srgb,var(--tibyan-overlay)_60%,transparent)]",
        // Enters by growing from 96%; with reduced motion it only fades in.
        "motion-safe:open:animate-dialog-in motion-reduce:open:animate-fade-in",
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-2xl leading-8 font-bold">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => ref.current?.close()}
            className={cx(
              "-me-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-control text-on-secondary",
              "hover:bg-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
            )}
          >
            <CloseIcon className="size-6" />
          </button>
        </div>
        <div className="text-ink-muted">{children}</div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </dialog>
  );
}

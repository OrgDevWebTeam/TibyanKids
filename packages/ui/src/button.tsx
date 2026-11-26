import { type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "fun" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

// As in the design system (Buttons/Button): a 4px darker edge along the bottom, inside the
// button's height, and darker shades on hover and press. Pressing removes the edge, so the label
// moves down like a real key. The design system has no danger button, so danger keeps its style.
// The edge reads the --tibyan-* token itself, so the dark scene's value applies inside it.
// Fun (coral, with dark text) is the child's action in the dark scene (Child World).
const EDGE = "pb-1 active:pb-0 active:shadow-none";
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-primary text-on-primary shadow-[inset_0_-4px_0_var(--tibyan-primary-edge)]",
    "hover:bg-primary-hover active:bg-primary-active",
    EDGE,
  ),
  secondary: cx(
    "bg-secondary text-on-secondary shadow-[inset_0_-4px_0_var(--tibyan-secondary-edge)]",
    "hover:bg-secondary-hover active:bg-secondary-hover",
    EDGE,
  ),
  fun: cx(
    "bg-fun text-on-fun shadow-[inset_0_-4px_0_var(--tibyan-fun-edge)]",
    "hover:brightness-105 active:brightness-100",
    EDGE,
  ),
  ghost: "bg-transparent text-on-secondary hover:bg-background active:bg-secondary",
  danger: "bg-danger text-on-primary hover:brightness-110",
};

// The design system's Button style: 56px tall, 24px at each side, 16px bold in both languages,
// on a 20px line in English and a 24px line in Arabic.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-control px-6 text-body leading-button",
  lg: "min-h-control px-10 text-lg leading-button",
};

/** Button styling as classes, so a link (for example a router `Link`) can look like a button. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-button font-bold transition",
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
    // Grey when disabled, in every variant. A loading button is disabled too, but keeps its
    // colour so it still looks like the action in progress.
    "disabled:cursor-not-allowed",
    "[&:disabled:not([aria-busy=true])]:bg-action-disabled",
    "[&:disabled:not([aria-busy=true])]:text-action-disabled-text",
    "[&:disabled:not([aria-busy=true])]:shadow-none [&:disabled:not([aria-busy=true])]:pb-0",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a busy state and blocks clicks while an action runs. */
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, fullWidth), className)}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent"
        />
      )}
      {children}
    </button>
  );
}

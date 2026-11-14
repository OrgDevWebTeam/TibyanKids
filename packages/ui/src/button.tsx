import { type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // As in the design system: darker shades on hover and press, grey when disabled. A loading
  // button is disabled too, but keeps its colour so it still looks like the action in progress.
  primary: cx(
    "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active",
    "[&:disabled:not([aria-busy=true])]:bg-line",
  ),
  secondary: "border border-control bg-surface text-ink hover:bg-surface-muted disabled:opacity-50",
  ghost: "bg-transparent text-ink hover:bg-surface-muted disabled:opacity-50",
  danger: "bg-danger text-on-primary hover:brightness-110 disabled:opacity-50",
};

// Button M (16px) and L (18px) from the design system, both semibold.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-control px-5 text-base",
  lg: "min-h-control px-6 text-lg",
};

/** Button styling as classes, so a link (for example a router `Link`) can look like a button. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed",
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

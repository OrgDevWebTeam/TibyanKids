import { type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

// As in the design system: a darker edge under primary and secondary buttons, darker shades on
// hover and press. The design system has no danger button, so danger keeps its earlier style.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-primary text-on-primary shadow-[0_4px_0_var(--color-primary-edge)]",
    "hover:bg-primary-hover active:bg-primary-active",
  ),
  secondary: cx(
    "bg-secondary text-on-secondary shadow-[0_4px_0_var(--color-secondary-edge)]",
    "hover:bg-secondary-hover active:bg-secondary-hover",
  ),
  ghost: "bg-transparent text-on-secondary hover:bg-background active:bg-secondary",
  danger: "bg-danger text-on-primary hover:brightness-110",
};

// The design system's Button style: 16px in English and 21px in Arabic (text-body), bold.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-control px-8 text-body",
  lg: "min-h-control px-10 text-lg",
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
    "[&:disabled:not([aria-busy=true])]:bg-line [&:disabled:not([aria-busy=true])]:text-ink-disabled",
    "[&:disabled:not([aria-busy=true])]:shadow-none",
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

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { CircleAlertIcon } from "./icons";

// Text styles from the design system: Label (16/24 Bold) above, Input (16/24 Medium) inside and
// Caption (14/20) under, with the same line heights in Arabic and English.
const CONTROL_CLASSES = cx(
  "min-h-control w-full rounded-control border-2 border-control bg-surface px-4",
  "text-body leading-6 font-medium text-ink",
  "placeholder:text-ink-muted",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
  // The design system's states (Inputs/Text field): border/strong at rest, border/selected on
  // hover and while editing, error when invalid, and a grey box when disabled.
  "hover:border-control-hover focus:border-primary aria-[invalid=true]:border-danger",
  "disabled:bg-surface-muted disabled:text-ink-disabled",
);

type FieldTextProps = {
  /** Links the label, hint and error to the control. Must be unique on the page. */
  id: string;
  label: string;
  /** Help text under the control. */
  hint?: string;
  /** Validation message. Its presence marks the control invalid. */
  error?: string;
};

/** IDs of the hint and error, for `aria-describedby`, so screen readers read them with the control. */
function describedBy({ id, hint, error }: FieldTextProps): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldTextProps & { required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="leading-6 font-bold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {" *"}
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-ink-muted">
          {hint}
        </p>
      )}
      {/* An error always pairs the circle-alert icon with its words, never colour alone. */}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-caption font-medium text-danger"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & FieldTextProps;

/**
 * Labelled text input. Direction is "auto" by default, so Arabic and English typing both read
 * correctly; pass dir="ltr" for emails, phone numbers and codes.
 */
export function TextField({
  id,
  label,
  hint,
  error,
  required,
  dir = "auto",
  className,
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        dir={dir}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, label, hint, error })}
        className={cx(CONTROL_CLASSES, className)}
        {...rest}
      />
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> &
  FieldTextProps & { options: SelectOption[] };

/** Labelled native select: the browser handles the keyboard, touch and screen-reader behaviour. */
export function SelectField({
  id,
  label,
  hint,
  error,
  required,
  options,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy({ id, label, hint, error })}
        className={cx(CONTROL_CLASSES, className)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

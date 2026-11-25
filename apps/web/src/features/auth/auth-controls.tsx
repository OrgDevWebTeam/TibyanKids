import { type FocusEvent, type ReactNode, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  MailIcon,
  OkIcon,
  UserIcon,
} from "./icons";

type AuthFieldProps = {
  id: string;
  label: string;
  /** "text" is the parent's name, typed in either direction. */
  type: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  placeholder: string;
  autoComplete: string;
  /** Shown under the field with an alert icon; marks the field invalid. */
  error?: string;
  /** A positive note under the field ("Looks good") when there is no error. */
  ok?: string;
  /** Accessible names of the show/hide button of a password field. */
  showLabel?: string;
  hideLabel?: string;
  /** More text that describes the field, such as the strength meter. */
  extraDescriptionId?: string;
  children?: ReactNode;
};

/**
 * A sign-in field from the design file: a label, an icon at the start (not for passwords, which
 * have the show/hide button at the end), and one message under it. A text field with a positive
 * note turns green (State=Success). Email and password are always typed left to right; a name
 * follows the language it is typed in.
 */
export function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  autoComplete,
  error,
  ok,
  showLabel,
  hideLabel,
  extraDescriptionId,
  children,
}: AuthFieldProps) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  const isName = type === "text";
  const messageId = `${id}-msg`;
  const message = error ?? ok;
  const LeadIcon = isName ? UserIcon : MailIcon;

  return (
    <div
      className="auth-field"
      data-invalid={error ? "true" : undefined}
      data-ok={!error && ok && !isPassword ? "true" : undefined}
      data-password-field={isPassword ? "true" : undefined}
    >
      <label htmlFor={id}>{label}</label>
      <div className="auth-control">
        {!isPassword && <LeadIcon className="auth-icon auth-lead" />}
        <input
          id={id}
          type={isPassword ? (shown ? "text" : "password") : type}
          dir={isName ? "auto" : "ltr"}
          inputMode={type === "email" ? "email" : undefined}
          autoCapitalize={isName ? "words" : "off"}
          spellCheck={false}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={[messageId, extraDescriptionId].filter(Boolean).join(" ")}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {isPassword && (
          <button
            type="button"
            className="auth-eye"
            aria-controls={id}
            aria-pressed={shown}
            aria-label={shown ? hideLabel : showLabel}
            onClick={() => setShown((current) => !current)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      <p id={messageId} className="auth-msg" data-tone={error ? "error" : "ok"} aria-live="polite">
        {message && (
          <>
            {error ? <AlertIcon /> : <OkIcon />}
            <span>{message}</span>
          </>
        )}
      </p>
      {children}
    </div>
  );
}

type AuthSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The icon at the start, like the other fields. */
  icon: ReactNode;
  /** The first, empty choice ("Choose your country"). */
  placeholder: string;
  options: { value: string; label: string }[];
  autoComplete: string;
};

/**
 * A dropdown with the same look as AuthField: a label, an icon at the start and an arrow at the
 * end. It is the browser's own list, so it works with the keyboard, screen readers and phones.
 */
export function AuthSelect({
  id,
  label,
  value,
  onChange,
  icon,
  placeholder,
  options,
  autoComplete,
}: AuthSelectProps) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-control">
        {icon}
        <select
          id={id}
          value={value}
          autoComplete={autoComplete}
          data-empty={value === "" ? "true" : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="auth-icon auth-chevron" />
      </div>
    </div>
  );
}

type AuthCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  error?: string;
  /** Smaller box, for "Remember me" next to the forgotten-password link. */
  compact?: boolean;
};

/** A checkbox with the design file's 28px box (24px when compact) and an optional message. */
export function AuthCheckbox({
  id,
  checked,
  onChange,
  children,
  error,
  compact,
}: AuthCheckboxProps) {
  const messageId = `${id}-msg`;
  return (
    <div className="auth-field" data-invalid={error ? "true" : undefined}>
      <label className="auth-check" data-compact={compact ? "true" : undefined}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="auth-box" aria-hidden="true">
          <CheckIcon />
        </span>
        <span>{children}</span>
      </label>
      {error !== undefined && (
        <p id={messageId} className="auth-msg" data-tone="error" aria-live="polite">
          {error && (
            <>
              <AlertIcon />
              <span>{error}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

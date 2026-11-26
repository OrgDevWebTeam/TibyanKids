/** The API accepts passwords of 8 to 72 characters. */
export const PASSWORD_MIN_LENGTH = 8;

/** The longest parent name the API keeps. */
export const NAME_MAX_LENGTH = 80;

/**
 * The version of the terms and privacy policy a parent accepts at sign-up; the API requires it.
 * TODO(osama): use the published version once the API team names it. "v1" is the value the API's
 * own tests use.
 */
export const POLICY_VERSION = "v1";

// The same check as the design file: something@domain.tld, with a top-level domain of 2+ letters.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/** Why a sign-in or sign-up field is not ready, as a dictionary key under `auth.errors`. */
export type AuthFieldError =
  | "nameRequired"
  | "nameTooLong"
  | "emailRequired"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordTooShort"
  | "confirmRequired"
  | "confirmMismatch"
  | "policyRequired";

export function nameError(value: string): AuthFieldError | undefined {
  const name = value.trim();
  if (name === "") return "nameRequired";
  return name.length > NAME_MAX_LENGTH ? "nameTooLong" : undefined;
}

export function emailError(value: string): AuthFieldError | undefined {
  const email = value.trim();
  if (email === "") return "emailRequired";
  return EMAIL_PATTERN.test(email) ? undefined : "emailInvalid";
}

export function passwordError(value: string): AuthFieldError | undefined {
  if (value === "") return "passwordRequired";
  return value.length < PASSWORD_MIN_LENGTH ? "passwordTooShort" : undefined;
}

export function confirmError(value: string, password: string): AuthFieldError | undefined {
  if (value === "") return "confirmRequired";
  return value === password ? undefined : "confirmMismatch";
}

/** 0 when empty, 1 too short, 2 okay, 3 strong: three kinds of character or 12 characters. */
export type PasswordStrength = 0 | 1 | 2 | 3;

export function passwordStrength(value: string): PasswordStrength {
  if (value === "") return 0;
  if (value.length < PASSWORD_MIN_LENGTH) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((kind) => kind.test(value));
  return kinds.length >= 3 || value.length >= 12 ? 3 : 2;
}

/**
 * A display name made from an email address, for when the API gives none. The part before "@",
 * without digits, split at dots, dashes and underscores, first two words.
 */
export function nameFromEmail(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._\-+\s]+/)
    .filter(Boolean)
    .slice(0, 2);
  const name = words.map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  return name || local;
}

/** Replaces each "{key}" in a dictionary string with its value. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

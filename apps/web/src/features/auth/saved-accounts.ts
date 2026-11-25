import { nameFromEmail } from "./auth-rules";

/**
 * An account remembered on this device so a parent can pick it at sign-in. Only the email and a
 * display name: never a password or a token, which stay in memory (session-store).
 */
export type SavedAccount = { email: string; name: string };

const ACCOUNTS_KEY = "tibyan.accounts.v1";
const REMEMBER_KEY = "tibyan.remember";
const MUTED_KEY = "tibyan.muted";
const MAX_ACCOUNTS = 5;

// Storage can be missing or full (private windows, blocked site data): every access is guarded,
// and the page still works without it.
function read(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : (JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved: the next visit starts without it.
  }
}

function isSavedAccount(value: unknown): value is SavedAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SavedAccount).email === "string" &&
    typeof (value as SavedAccount).name === "string"
  );
}

/** The accounts saved on this device, most recent first. */
export function savedAccounts(): SavedAccount[] {
  const value = read(ACCOUNTS_KEY);
  return Array.isArray(value) ? value.filter(isSavedAccount) : [];
}

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Saves an account at the top of the list (at most five) and returns it. The name is the one the
 * parent gave, if known; otherwise the one saved before, or one made from the email.
 */
export function saveAccount(email: string, name?: string): SavedAccount {
  const clean = email.trim();
  const accounts = savedAccounts();
  const existing = accounts.find((account) => sameEmail(account.email, clean));
  const saved = { email: clean, name: name ?? existing?.name ?? nameFromEmail(clean) };
  const others = accounts.filter((account) => !sameEmail(account.email, clean));
  write(ACCOUNTS_KEY, [saved, ...others].slice(0, MAX_ACCOUNTS));
  return saved;
}

/** Removes an account from this device. */
export function forgetAccount(email: string) {
  write(
    ACCOUNTS_KEY,
    savedAccounts().filter((account) => !sameEmail(account.email, email)),
  );
}

/** Whether "Remember me" is ticked. It starts ticked, as in the design. */
export function rememberChoice(): boolean {
  return read(REMEMBER_KEY) !== false;
}

export function setRememberChoice(remember: boolean) {
  write(REMEMBER_KEY, remember);
}

/** Whether the character's voice is muted on this device. */
export function mutedChoice(): boolean {
  return read(MUTED_KEY) === true;
}

export function setMutedChoice(muted: boolean) {
  write(MUTED_KEY, muted);
}

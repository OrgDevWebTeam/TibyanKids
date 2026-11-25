import {
  ageOn,
  DISPLAY_NAME_MAX_LENGTH,
  MAX_CHILD_AGE,
  MIN_CHILD_AGE,
  parseDate,
} from "./child-form";
import {
  type AgeBand,
  type ChildChanges,
  type ChildDetails,
  type HomeLanguage,
  type NewChild,
} from "./children-api";

// Rules for a child's details on the parent dashboard (Figma "Parent Dashboard": Add Child and
// Child Profile). Pure functions, so they are easy to test; the API checks every field again.

/** The sidebar lists children youngest first (PD/Sidebar: "By age"). Same birthday: by name. */
export function sortByAge(children: ChildDetails[]): ChildDetails[] {
  return [...children].sort(
    (a, b) => b.dateOfBirth.localeCompare(a.dateOfBirth) || a.name.localeCompare(b.name),
  );
}

/** The child's age in whole years on `today`, or undefined if the date is not a real date. */
export function childAge(dateOfBirth: string, today: Date): number | undefined {
  const date = parseDate(dateOfBirth);
  return date ? ageOn(date, today) : undefined;
}

/** Each age band's name, as on the landing page's preview (Little Explorer for 6–8, ...). */
export const BAND_KEYS = {
  "6-8": "explorer",
  "9-11": "navigator",
  "12-14": "captain",
} as const satisfies Record<AgeBand, string>;

/** The API's limits on interests. */
export const INTEREST_MAX_LENGTH = 50;
export const INTERESTS_MAX_COUNT = 20;

/** The child form (Add Child, and editing on Child Profile) as the inputs hold it. */
export type ChildFormValues = {
  name: string;
  /** As the date input gives it: YYYY-MM-DD, or empty. */
  dateOfBirth: string;
  homeLanguage: HomeLanguage;
  interests: string[];
};

export type ChildFormError =
  "required" | "tooLong" | "ageRange" | "interestTooLong" | "tooManyInterests";

export type ChildFormErrors = Partial<Record<keyof ChildFormValues, ChildFormError>>;

/** An empty Add Child form. Arabic is the API's default home language, and the design's. */
export const EMPTY_CHILD_FORM: ChildFormValues = {
  name: "",
  dateOfBirth: "",
  homeLanguage: "ar",
  interests: [],
};

/** The form filled with the child's saved details. */
export function toChildForm(child: ChildDetails): ChildFormValues {
  return {
    name: child.name,
    dateOfBirth: child.dateOfBirth,
    homeLanguage: child.homeLanguage,
    interests: child.interests,
  };
}

/**
 * Adds an interest the parent typed: trimmed, and not added twice (case does not matter). Returns
 * the new list, or the reason it cannot be added.
 */
export function addInterest(
  interests: string[],
  typed: string,
): { interests: string[] } | { error: "interestTooLong" | "tooManyInterests" } {
  const interest = typed.trim();
  const known = interests.some((item) => item.toLowerCase() === interest.toLowerCase());
  if (interest === "" || known) return { interests };
  if (interest.length > INTEREST_MAX_LENGTH) return { error: "interestTooLong" };
  if (interests.length >= INTERESTS_MAX_COUNT) return { error: "tooManyInterests" };
  return { interests: [...interests, interest] };
}

/** Checks the form before it is sent, for the parent's convenience. */
export function validateChildForm(values: ChildFormValues, today: Date): ChildFormErrors {
  const errors: ChildFormErrors = {};
  const name = values.name.trim();

  if (name === "") errors.name = "required";
  else if (name.length > DISPLAY_NAME_MAX_LENGTH) errors.name = "tooLong";

  const age = childAge(values.dateOfBirth, today);
  if (age === undefined) errors.dateOfBirth = "required";
  else if (age < MIN_CHILD_AGE || age > MAX_CHILD_AGE) errors.dateOfBirth = "ageRange";

  if (values.interests.length > INTERESTS_MAX_COUNT) errors.interests = "tooManyInterests";
  else if (values.interests.some((item) => item.length > INTEREST_MAX_LENGTH)) {
    errors.interests = "interestTooLong";
  }

  return errors;
}

/** What Add Child sends (POST /api/v1/children). */
export function toNewChild(values: ChildFormValues): NewChild {
  return {
    name: values.name.trim(),
    dateOfBirth: values.dateOfBirth,
    homeLanguage: values.homeLanguage,
    interests: values.interests,
  };
}

/** Only the fields the parent changed, so the API gets the smallest update. */
export function childChanges(child: ChildDetails, values: ChildFormValues): ChildChanges {
  const changes: ChildChanges = {};
  const name = values.name.trim();

  if (name !== child.name) changes.name = name;
  if (values.dateOfBirth !== child.dateOfBirth) changes.dateOfBirth = values.dateOfBirth;
  if (values.homeLanguage !== child.homeLanguage) changes.homeLanguage = values.homeLanguage;
  if (values.interests.join("\n") !== child.interests.join("\n")) {
    changes.interests = values.interests;
  }

  return changes;
}

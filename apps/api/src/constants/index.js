export const DOMAINS = ["faith", "quran", "arabic", "character", "future_skills"];
export const AGE_BANDS = ["6-8", "9-11", "12-14"];
export const LANGUAGES = ["ar", "en"];
export const ROLES = [
  "child",
  "parent",
  "teacher",
  "content_admin",
  "reviewer",
  "platform_admin",
  "analytics_support",
];

// The longest name a user can have. The registration check and the User model both use it, so a
// name that passes the check can always be saved.
export const USER_NAME_MAX_LENGTH = 80;

// The longest name a child can have. The validation and the Child model both use it. It matches the
// limit of the child form in the web app.
export const CHILD_NAME_MAX_LENGTH = 50;

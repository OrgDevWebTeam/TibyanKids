// SEC-003: sensitive data is encrypted in transit. Outside development, the database connection
// must use TLS and must not point to a local database. Returns a message, or null when it is fine.
// Kept free of imports so it can be tested without the app settings.

const LOCAL_HOST = /(?:@|\/\/)(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/?]|$)/i;

export function databaseUrlProblem(nodeEnv, url) {
  if (nodeEnv === "development") return null;

  if (/[?&](?:tls|ssl)=false(?:&|$)/i.test(url)) {
    return "TLS must not be turned off in staging or production";
  }

  // mongodb+srv:// turns TLS on by default. A plain mongodb:// URL needs tls=true.
  const usesTls = url.startsWith("mongodb+srv://") || /[?&](?:tls|ssl)=true(?:&|$)/i.test(url);
  if (!usesTls) {
    return "must use mongodb+srv:// or tls=true in staging and production";
  }

  if (LOCAL_HOST.test(url)) {
    return "must not point to a local database in staging or production";
  }

  return null;
}

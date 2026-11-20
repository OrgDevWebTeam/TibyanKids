import { createHash, randomBytes } from "node:crypto";

const TOKEN_LIFETIME_HOURS = 24;

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/** Makes a random one-time token. Only the hash and the expiry are meant to be stored. */
export function createVerificationToken() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_HOURS * 60 * 60 * 1000),
  };
}

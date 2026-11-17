import config from "../config/env.js";

/** Emails "sent" in development and tests. Staging and production never use it. */
export const outbox = [];

// All mail goes through this object, so a real provider can replace it in one place,
// and tests can replace a single method.
export const mailer = {
  async sendVerificationEmail({ to, token }) {
    if (config.nodeEnv === "development") {
      outbox.push({ to, token });
      // Development only: no email provider exists yet, so the link is printed here.
      // eslint-disable-next-line no-console
      console.log(`[dev mail] to ${to}: ${config.clientOrigin}/verify-email?token=${token}`);
      return;
    }
    throw new Error("No email provider is configured yet");
  },
};

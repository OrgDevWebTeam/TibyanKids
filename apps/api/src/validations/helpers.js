import { z } from "zod";

export const text = (label) =>
  z.string({
    error: (issue) =>
      issue.input === undefined ? `${label} is required` : `${label} must be text`,
  });

export const objectId = (label) => text(label).regex(/^[0-9a-fA-F]{24}$/, `${label} is not valid`);

export const oneOf = (label, values) =>
  z.enum(values, { error: `${label} must be one of: ${values.join(", ")}` });

export const whole = (label, min, max) =>
  z
    .number({
      error: (issue) =>
        issue.input === undefined ? `${label} is required` : `${label} must be a number`,
    })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be between ${min} and ${max}`)
    .max(max, `${label} must be between ${min} and ${max}`);

// A country is a two-letter ISO 3166-1 code, for example JO. Capitals are fixed for the caller, so
// "jo" and " JO " are both saved as "JO". Free text such as "Jordan" is refused. The format is
// checked, not whether the code is assigned to a country.
export const countryCode = (label) =>
  text(label)
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, `${label} must be a two-letter country code, for example JO`);

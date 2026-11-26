import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// WCAG 2.2 AA (NFR-A11Y-001): text needs 4.5:1; control borders and the focus ring need 3:1.

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/** The declarations inside the first block that starts with `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in styles.css`);
  return css.slice(start, css.indexOf("}", start));
}

function colourTokens(source: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of source.matchAll(/--tibyan-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

const colours = colourTokens(block(":root"));
// The dark scene keeps every light token it does not redefine.
const darkColours = { ...colours, ...colourTokens(block('[data-theme="dark"]')) };

function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["ink", "surface"],
  ["ink", "background"],
  ["ink", "surface-muted"],
  ["ink-muted", "surface"],
  ["ink-muted", "background"],
  ["ink-muted", "surface-muted"],
  ["primary", "surface"],
  ["primary", "background"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["on-primary", "primary-active"],
  ["on-primary", "danger"],
  ["danger", "surface"],
  ["danger", "background"],
  ["danger", "surface-muted"],
  ["success", "surface"],
  ["success", "surface-muted"],
  ["warning", "surface"],
  ["warning", "surface-muted"],
  ["info", "surface"],
  ["info", "surface-muted"],
  ["on-secondary", "secondary"],
  ["on-secondary", "secondary-hover"],
  ["on-secondary", "background"],
  ["link", "surface"],
  ["link", "background"],
  // Tags: the deep text shade on the tint of the same tone.
  ["danger", "danger-tint"],
  ["success", "success-tint"],
  ["warning", "warning-tint"],
  ["info", "info-tint"],
];

// Input borders (border/strong, 3:1 since the design system changed them), focus, and the ink
// icon glyph on each bright fill in alerts.
const NON_TEXT_PAIRS: Array<[string, string]> = [
  ["control", "surface"],
  ["control", "background"],
  ["control-hover", "surface"],
  ["control-hover", "background"],
  ["focus", "surface"],
  ["focus", "background"],
  ["ink", "danger-fill"],
  ["ink", "success-fill"],
  ["ink", "warning-fill"],
  ["ink", "info-fill"],
];

describe("token colours", () => {
  it("define every colour the checks need", () => {
    const names = [...TEXT_PAIRS, ...NON_TEXT_PAIRS].flat();
    for (const name of names) {
      expect(colours[name], `--tibyan-${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT_PAIRS)("%s text on %s reaches 4.5:1", (text, background) => {
    expect(contrast(colours[text]!, colours[background]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s reaches 3:1", (part, background) => {
    expect(contrast(colours[part]!, colours[background]!)).toBeGreaterThanOrEqual(3);
  });
});

// The dark scene of the sign-in and sign-up pages.
const DARK_TEXT_PAIRS: Array<[string, string]> = [
  ["ink", "surface"],
  ["ink", "background"],
  ["ink", "surface-muted"],
  ["ink-muted", "surface"],
  ["ink-muted", "background"],
  ["ink-muted", "surface-muted"],
  ["link", "surface"],
  ["link", "background"],
  ["danger", "surface"],
  ["danger", "background"],
  ["success", "surface"],
  ["success", "background"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["on-primary", "primary-active"],
  ["on-secondary", "secondary"],
  ["on-secondary", "secondary-hover"],
  ["on-bubble", "bubble"],
  ["on-bubble", "success"],
];

const DARK_NON_TEXT_PAIRS: Array<[string, string]> = [
  ["control", "surface"],
  ["control", "background"],
  ["control-hover", "surface"],
  ["control-hover", "background"],
  ["focus", "surface"],
  ["focus", "background"],
];

describe("dark scene colours", () => {
  it.each(DARK_TEXT_PAIRS)("%s text on %s reaches 4.5:1", (text, background) => {
    expect(contrast(darkColours[text]!, darkColours[background]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(DARK_NON_TEXT_PAIRS)("%s on %s reaches 3:1", (part, background) => {
    expect(contrast(darkColours[part]!, darkColours[background]!)).toBeGreaterThanOrEqual(3);
  });
});

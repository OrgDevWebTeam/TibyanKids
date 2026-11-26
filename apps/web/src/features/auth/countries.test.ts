import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryOptions } from "./countries";

describe("countries", () => {
  it("lists each two-letter code once", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("names each country in the page's language and keeps the code as the value", () => {
    const jordan = (locale: string) =>
      countryOptions(locale).find((option) => option.value === "JO")?.label;
    expect(jordan("en")).toBe("Jordan");
    expect(jordan("ar")).toBe("الأردن");
  });

  it("sorts the names alphabetically in that language", () => {
    for (const locale of ["en", "ar"]) {
      const labels = countryOptions(locale).map((option) => option.label);
      expect(labels).toEqual([...labels].sort(new Intl.Collator(locale).compare));
    }
  });
});

// The Quran competency list (packages/contracts/data/quran_competencies.json) must be loadable as is
// through POST /api/v1/curriculum/competencies. Checked with the API's own request schema, so a change
// on either side fails here. Mapping: docs/ai/quran-growth-mapping.md.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCompetencySchema } from "../../src/validations/curriculumValidation.js";

const DATA = new URL("../../../../packages/contracts/data/", import.meta.url);
const competencies = JSON.parse(readFileSync(new URL("quran_competencies.json", DATA), "utf8"));
const surahs = JSON.parse(readFileSync(new URL("reference_quran_text.json", DATA), "utf8"));

describe("Quran competencies", () => {
  it("each one is a valid create request", () => {
    for (const competency of competencies) {
      const result = createCompetencySchema.safeParse(competency);
      assert.ok(result.success, `${competency.code}: ${JSON.stringify(result.error?.issues)}`);
    }
  });

  it("are all in the quran domain", () => {
    assert.deepEqual([...new Set(competencies.map((c) => c.domain))], ["quran"]);
  });

  it("have unique codes, as the database requires (codes are stored in upper case)", () => {
    const codes = competencies.map((c) => c.code.toUpperCase());
    assert.equal(new Set(codes).size, codes.length);
    assert.deepEqual(
      competencies.map((c) => c.code),
      codes,
    );
  });

  it("have one competency for each prototype surah", () => {
    const expected = surahs.map((s) => `QURAN-SURAH-${String(s.surah_id).padStart(3, "0")}`);
    const surahCodes = competencies
      .map((c) => c.code)
      .filter((code) => code.startsWith("QURAN-SURAH-"));
    assert.deepEqual(surahCodes, expected);
  });
});

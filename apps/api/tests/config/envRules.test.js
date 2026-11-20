import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { databaseUrlProblem } from "../../src/config/envRules.js";

const ATLAS = "mongodb+srv://user:<PASSWORD>@cluster0.example.mongodb.net/noor?appName=noor";

describe("database settings outside development (SEC-003)", () => {
  it("allows anything in development, including a local database without TLS", () => {
    assert.equal(databaseUrlProblem("development", "mongodb://x:<PASSWORD>@localhost/x"), null);
    assert.equal(databaseUrlProblem("development", ATLAS), null);
  });

  for (const nodeEnv of ["staging", "production"]) {
    it(`${nodeEnv}: accepts an Atlas mongodb+srv connection`, () => {
      assert.equal(databaseUrlProblem(nodeEnv, ATLAS), null);
    });

    it(`${nodeEnv}: accepts a remote mongodb:// connection with tls=true`, () => {
      const url = "mongodb://u:<PASSWORD>@db1.example.com:27017,db2.example.com/noor?tls=true";
      assert.equal(databaseUrlProblem(nodeEnv, url), null);
    });

    it(`${nodeEnv}: refuses a connection without TLS`, () => {
      const url = "mongodb://u:<PASSWORD>@db1.example.com:27017/noor";
      assert.match(databaseUrlProblem(nodeEnv, url), /mongodb\+srv:\/\/ or tls=true/);
    });

    it(`${nodeEnv}: refuses TLS turned off, even with mongodb+srv`, () => {
      assert.match(databaseUrlProblem(nodeEnv, `${ATLAS}&tls=false`), /TLS must not be turned off/);
      assert.match(databaseUrlProblem(nodeEnv, `${ATLAS}&ssl=false`), /TLS must not be turned off/);
    });

    it(`${nodeEnv}: refuses a local database, even with TLS`, () => {
      for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
        const url = `mongodb://u:<PASSWORD>@${host}:27017/noor?tls=true`;
        assert.match(databaseUrlProblem(nodeEnv, url), /local database/, host);
      }
      const noCredentials = "mongodb://localhost:27017/noor?tls=true";
      assert.match(databaseUrlProblem(nodeEnv, noCredentials), /local database/);
    });
  }

  it("does not mistake a host that only contains the word localhost for a local one", () => {
    const url = "mongodb+srv://u:<PASSWORD>@localhost-backup.example.com/noor";
    assert.equal(databaseUrlProblem("production", url), null);
  });
});

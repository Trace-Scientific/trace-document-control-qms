import assert from "node:assert/strict";
import test from "node:test";
import { validationConfiguration } from "./validation-smoke.mjs";

test("accepts an HTTPS validation environment with scoped secrets", () => {
  const result = validationConfiguration({
    VALIDATION_BASE_URL: "https://validation.example.test/path",
    VALIDATION_SESSION_TOKEN: "opaque-session",
    CRON_SECRET: "a-secure-validation-secret-123456789",
  });
  assert.equal(result.baseUrl, "https://validation.example.test");
});

test("rejects plaintext origins and incomplete credentials", () => {
  assert.throws(() =>
    validationConfiguration({
      VALIDATION_BASE_URL: "http://validation.example.test",
      VALIDATION_SESSION_TOKEN: "opaque-session",
      CRON_SECRET: "a-secure-validation-secret-123456789",
    }),
  );
  assert.throws(() =>
    validationConfiguration({
      VALIDATION_BASE_URL: "https://validation.example.test",
      VALIDATION_SESSION_TOKEN: "",
      CRON_SECRET: "short",
    }),
  );
});

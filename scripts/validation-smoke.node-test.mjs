import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runValidationSmoke, validationConfiguration } from "./validation-smoke.mjs";

const completeConfiguration = {
  VALIDATION_BASE_URL: "https://validation.example.test",
  VALIDATION_SESSION_TOKEN: "opaque-session",
  CRON_SECRET: "a-secure-validation-secret-123456789",
  EXPECTED_RELEASE_VERSION: "0.1.0-rc.2",
  EXPECTED_RELEASE_SHA: "e9992606c460f2d3bef4ba7f1dde5c1b6f691e00",
};

test("accepts an HTTPS validation environment with scoped secrets", () => {
  const result = validationConfiguration({
    ...completeConfiguration,
    VALIDATION_BASE_URL: "https://validation.example.test/path",
  });
  assert.equal(result.baseUrl, "https://validation.example.test");
});

test("rejects a reachable deployment with the wrong release identity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "ok",
        release: {
          version: "0.1.0-rc.1",
          sha: completeConfiguration.EXPECTED_RELEASE_SHA,
        },
      }),
      { status: 200 },
    );
  try {
    await assert.rejects(
      runValidationSmoke(completeConfiguration),
      /release identity does not match/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the AWS task definition secret-free and digest-addressed", async () => {
  const template = JSON.parse(
    await readFile(new URL("../deploy/aws/validation/task-definition.json", import.meta.url)),
  );
  const container = template.containerDefinitions[0];
  assert.equal(container.image, "${IMAGE_URI}@${IMAGE_DIGEST}");
  assert.deepEqual(
    container.secrets.map((entry) => entry.valueFrom),
    ["${DATABASE_URL_SECRET_ARN}", "${CRON_SECRET_ARN}"],
  );
  assert.equal(JSON.stringify(template).includes("postgresql://"), false);
});

test("rejects plaintext origins and incomplete credentials", () => {
  assert.throws(() =>
    validationConfiguration({
      VALIDATION_BASE_URL: "http://validation.example.test",
      VALIDATION_SESSION_TOKEN: "opaque-session",
      CRON_SECRET: "a-secure-validation-secret-123456789",
      EXPECTED_RELEASE_VERSION: "0.1.0-rc.2",
      EXPECTED_RELEASE_SHA: "e9992606c460f2d3bef4ba7f1dde5c1b6f691e00",
    }),
  );
  assert.throws(() =>
    validationConfiguration({
      VALIDATION_BASE_URL: "https://validation.example.test",
      VALIDATION_SESSION_TOKEN: "",
      CRON_SECRET: "short",
      EXPECTED_RELEASE_VERSION: "latest",
      EXPECTED_RELEASE_SHA: "short",
    }),
  );
});

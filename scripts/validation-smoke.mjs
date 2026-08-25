import process from "node:process";
import { pathToFileURL } from "node:url";

export function validationConfiguration(source = process.env) {
  const baseUrl = new URL(source.VALIDATION_BASE_URL ?? "");
  if (baseUrl.protocol !== "https:")
    throw new Error("VALIDATION_BASE_URL must use HTTPS");
  if (!source.VALIDATION_SESSION_TOKEN)
    throw new Error("VALIDATION_SESSION_TOKEN is required");
  if (!source.CRON_SECRET || source.CRON_SECRET.length < 32)
    throw new Error("CRON_SECRET must contain at least 32 characters");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(source.EXPECTED_RELEASE_VERSION ?? ""))
    throw new Error("EXPECTED_RELEASE_VERSION must be a semantic release version");
  if (!/^[0-9a-f]{40}$/.test(source.EXPECTED_RELEASE_SHA ?? ""))
    throw new Error("EXPECTED_RELEASE_SHA must be a full lowercase Git commit SHA");
  return {
    baseUrl: baseUrl.origin,
    sessionToken: source.VALIDATION_SESSION_TOKEN,
    cronSecret: source.CRON_SECRET,
    expectedReleaseVersion: source.EXPECTED_RELEASE_VERSION,
    expectedReleaseSha: source.EXPECTED_RELEASE_SHA,
  };
}

export async function runValidationSmoke(source = process.env) {
  const config = validationConfiguration(source),
    evidence = [];
  const liveness = await check(config, evidence, "liveness", "/api/health", 200);
  const identity = JSON.parse(liveness.body).release;
  if (
    identity?.version !== config.expectedReleaseVersion ||
    identity?.sha !== config.expectedReleaseSha
  ) {
    throw new Error("deployed release identity does not match the approved candidate");
  }
  await check(config, evidence, "readiness", "/api/health/readiness", 200);
  await check(config, evidence, "authentication-boundary", "/api/documents", 401);
  await check(config, evidence, "authenticated-dashboard", "/api/workspace/dashboard", 200, {
    cookie: `qms_session=${config.sessionToken}`,
  });
  await check(config, evidence, "authenticated-documents", "/api/documents?limit=1", 200, {
    cookie: `qms_session=${config.sessionToken}`,
  });
  await check(config, evidence, "overdue-monitor", "/api/internal/review-overdue", 200, {
    method: "POST",
    authorization: `Bearer ${config.cronSecret}`,
  });
  return evidence;
}

async function check(config, evidence, name, path, expectedStatus, options = {}) {
  const headers = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.authorization) headers.authorization = options.authorization;
  const startedAt = new Date(),
    response = await fetch(`${config.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      redirect: "error",
    }),
    body = await response.text();
  if (response.status !== expectedStatus)
    throw new Error(`${name} returned ${response.status}; expected ${expectedStatus}`);
  evidence.push({
    name,
    status: response.status,
    checkedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    responseBytes: Buffer.byteLength(body),
  });
  return { body };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runValidationSmoke()
    .then((evidence) => process.stdout.write(`${JSON.stringify({ status: "passed", evidence }, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Validation smoke failed"}\n`);
      process.exitCode = 1;
    });
}

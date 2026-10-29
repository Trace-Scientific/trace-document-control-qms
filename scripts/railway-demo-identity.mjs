// Pure, fail-closed validation. This module never opens a database connection.
export const DEMO_RAILWAY = Object.freeze({
  projectId: "e6cc5f1e-3064-46d3-90bf-c763334f01a8",
  environmentId: "3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4",
  applicationServiceId: "9c8676bd-5d9b-4306-8e85-062bd95bf72c",
  preflightServiceId: "eefdeaed-373e-4848-b4c2-310f453e7326",
  databaseServiceId: "7f2ad369-c21a-486a-8ac4-4a170b1674d3",
  databaseHost: "postgres-6qrb.railway.internal",
  databaseName: "railway",
});

export function assertRailwayDemoIdentity(identity, expectedServiceId = DEMO_RAILWAY.applicationServiceId) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Demo safety: explicit environment identity is required");
  }
  for (const [field, expected] of Object.entries(DEMO_RAILWAY)) {
    if (field === "preflightServiceId") continue;
    if (field === "applicationServiceId") {
      if (identity.applicationServiceId !== expectedServiceId) throw new Error("Demo safety: unexpected applicationServiceId");
      continue;
    }
    if (identity[field] !== expected) {
      throw new Error(`Demo safety: unexpected ${field}`);
    }
  }
  if (identity.deploymentTier !== "demo") {
    throw new Error("Demo safety: deployment tier must be demo");
  }
  return true;
}

export function assertRailwayDemoDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== "string" || !databaseUrl) {
    throw new Error("Demo safety: DATABASE_URL is required");
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Demo safety: invalid DATABASE_URL");
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    url.hostname !== DEMO_RAILWAY.databaseHost ||
    url.port !== "5432" ||
    url.pathname !== `/${DEMO_RAILWAY.databaseName}` ||
    !url.username ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "schema") ||
    (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")
  ) {
    throw new Error("Demo safety: database URL does not match the isolated Railway demo");
  }
  return true;
}

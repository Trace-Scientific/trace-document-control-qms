import { DEMO_RAILWAY, assertRailwayDemoIdentity, assertRailwayDemoDatabaseUrl } from "./railway-demo-identity.mjs";

export function attestRailwayDemoRuntime(env = process.env, expectedServiceId = DEMO_RAILWAY.applicationServiceId) {
  const identity = {
    projectId: env.RAILWAY_PROJECT_ID,
    environmentId: env.RAILWAY_ENVIRONMENT_ID,
    applicationServiceId: env.RAILWAY_SERVICE_ID,
    databaseServiceId: env.DEMO_DATABASE_SERVICE_ID,
    databaseHost: DEMO_RAILWAY.databaseHost,
    databaseName: DEMO_RAILWAY.databaseName,
    deploymentTier: env.DEPLOYMENT_TIER,
  };
  assertRailwayDemoIdentity(identity, expectedServiceId);
  assertRailwayDemoDatabaseUrl(env.DATABASE_URL);
  if (env.RAILWAY_ENVIRONMENT_NAME !== "demo") {
    throw new Error("Demo runtime: expected Railway demo environment name");
  }
  if (env.DEMO_DATABASE_SERVICE_ID !== DEMO_RAILWAY.databaseServiceId) {
    throw new Error("Demo runtime: database service identity must be explicitly configured");
  }
  return Object.freeze({ identity, databaseUrl: env.DATABASE_URL });
}

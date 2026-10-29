import { DEMO_RAILWAY, assertRailwayDemoIdentity, assertRailwayDemoDatabaseUrl } from "./railway-demo-identity.mjs";

export function validateDemoDatabaseIdentityRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Demo preflight: expected exactly one database identity row");
  }
  const row = rows[0];
  if (
    row.database_name !== DEMO_RAILWAY.databaseName ||
    typeof row.database_user !== "string" ||
    !row.database_user ||
    row.database_user === "postgres" ||
    row.server_address === null ||
    typeof row.server_address !== "string"
  ) {
    throw new Error("Demo preflight: connected PostgreSQL identity is not approved");
  }
  return { databaseName: row.database_name, databaseUser: row.database_user };
}

export async function inspectRailwayDemoDatabase({ db, identity, databaseUrl }) {
  assertRailwayDemoIdentity(identity);
  assertRailwayDemoDatabaseUrl(databaseUrl);
  if (!db || typeof db.$queryRaw !== "function") {
    throw new Error("Demo preflight: a database client is required");
  }
  const rows = await db.$queryRaw`
    SELECT current_database() AS database_name,
           current_user AS database_user,
           host(inet_server_addr()) AS server_address
  `;
  const database = validateDemoDatabaseIdentityRows(rows);
  const existing = await db.organization.findUnique({
    where: { loginCode: "trace-demo-lab" },
    select: { id: true, loginCode: true, active: true },
  });
  return {
    mode: "READ_ONLY",
    environmentId: DEMO_RAILWAY.environmentId,
    database,
    proposedLoginCode: "trace-demo-lab",
    canCreate: existing === null,
    existingOrganization: existing ? { loginCode: existing.loginCode, active: existing.active } : null,
    writesPerformed: 0,
  };
}

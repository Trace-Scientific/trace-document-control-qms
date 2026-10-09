export function assertDemoTestDatabase(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== "string") {
    throw new Error("Demo database safety: DATABASE_URL is required");
  }

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Demo database safety: invalid DATABASE_URL");
  }

  const allowed =
    url.protocol === "postgresql:" &&
    url.hostname === "127.0.0.1" &&
    url.port === "5433" &&
    url.username === "trace_qms_test" &&
    url.password === "local_integration_test_only" &&
    url.pathname === "/trace_qms_integration_test" &&
    url.hash === "" &&
    url.searchParams.size === 1 &&
    url.searchParams.get("schema") === "public" &&
    [...url.searchParams.keys()].every((key) => key === "schema");

  if (!allowed) {
    throw new Error(
      "Demo database safety: connection is not the approved isolated integration-test database",
    );
  }

  return true;
}

export async function assertDemoTestDatabaseIdentity(db) {
  const rows = await db.$queryRaw`
    SELECT current_database() AS database_name,
           current_user AS database_user
  `;

  if (
    rows.length !== 1 ||
    rows[0].database_name !== "trace_qms_integration_test" ||
    rows[0].database_user !== "trace_qms_test"
  ) {
    throw new Error(
      "Demo database safety: connected PostgreSQL database identity is not approved",
    );
  }

  return true;
}

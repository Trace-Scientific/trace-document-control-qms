// Read-only PostgreSQL catalog inspection for the isolated Railway demo.
// This module does not open connections, grant privileges, or mutate data.
export function validateDemoCatalogInspection(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error("Demo catalog: expected exactly Organization and AuditEvent");
  }
  const byName = new Map(rows.map((r) => [r.table_name, r]));
  if (byName.size !== 2 || !byName.has("Organization") || !byName.has("AuditEvent")) {
    throw new Error("Demo catalog: unexpected table identity");
  }
  for (const name of ["Organization", "AuditEvent"]) {
    const r = byName.get(name);
    if (r.schema_name !== "public" || r.table_kind !== "r" ||
        typeof r.table_owner !== "string" || !r.table_owner ||
        typeof r.row_security !== "boolean" ||
        typeof r.force_row_security !== "boolean" ||
        typeof r.trigger_count !== "number" || r.trigger_count < 0 ||
        typeof r.policy_count !== "number" || r.policy_count < 0 ||
        !Array.isArray(r.trigger_definitions) || !r.trigger_definitions.every((x) => typeof x === "string")) {
      throw new Error("Demo catalog: invalid metadata for " + name);
    }
  }
  return {
    mode: "READ_ONLY",
    writesPerformed: 0,
    tables: ["Organization", "AuditEvent"].map((name) => ({
      table: name,
      owner: byName.get(name).table_owner,
      rowSecurity: byName.get(name).row_security,
      forceRowSecurity: byName.get(name).force_row_security,
      triggerCount: byName.get(name).trigger_count,
      policyCount: byName.get(name).policy_count,
      triggerDefinitions: byName.get(name).trigger_definitions,
    })),
  };
}

export async function inspectDemoCatalog(db) {
  if (!db || typeof db.$queryRaw !== "function") {
    throw new Error("Demo catalog: read-only database client required");
  }
  const rows = await db.$queryRaw`
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           c.relkind::text AS table_kind,
           pg_get_userbyid(c.relowner) AS table_owner,
           c.relrowsecurity AS row_security,
           c.relforcerowsecurity AS force_row_security,
           (SELECT count(*)::int FROM pg_trigger t
             WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS trigger_count,
           (SELECT count(*)::int FROM pg_policy p
             WHERE p.polrelid = c.oid) AS policy_count,
           (SELECT COALESCE(array_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname), ARRAY[]::text[])
              FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS trigger_definitions
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('Organization', 'AuditEvent')
       AND c.relkind = 'r'
  `;
  return validateDemoCatalogInspection(rows);
}

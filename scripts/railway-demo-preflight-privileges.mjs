// Read-only inspection of the existing demo preflight login's effective permissions.
// This does not inspect or create the separate, currently disabled provisioner role.
export function validateDemoPreflightPrivileges(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Demo privileges: expected one role row");
  const r = rows[0];
  if (r.database_user !== "trace_demo_preflight_ro" ||
      r.is_superuser !== false || r.can_create_db !== false ||
      r.can_create_role !== false || r.can_replicate !== false ||
      r.bypass_rls !== false || r.transaction_read_only !== "on" ||
      r.can_create_schema !== false ||
      r.can_insert_organization !== false || r.can_update_organization !== false ||
      r.can_delete_organization !== false || r.can_insert_audit !== false ||
      r.can_update_audit !== false || r.can_delete_audit !== false ||
      r.can_select_organization !== true) {
    throw new Error("Demo privileges: preflight role is not restricted to read-only inspection");
  }
  return { mode: "READ_ONLY", role: r.database_user, verifiedReadOnly: true, writesPerformed: 0 };
}
export async function inspectDemoPreflightPrivileges(db) {
  if (!db || typeof db.$queryRaw !== "function") throw new Error("Demo privileges: database client required");
  const rows = await db.$queryRaw`
    SELECT current_user AS database_user,
           r.rolsuper AS is_superuser,
           r.rolcreatedb AS can_create_db,
           r.rolcreaterole AS can_create_role,
           r.rolreplication AS can_replicate,
           r.rolbypassrls AS bypass_rls,
           current_setting('transaction_read_only') AS transaction_read_only,
           has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema,
           has_table_privilege(current_user, 'public."Organization"', 'SELECT') AS can_select_organization,
           has_table_privilege(current_user, 'public."Organization"', 'INSERT') AS can_insert_organization,
           has_table_privilege(current_user, 'public."Organization"', 'UPDATE') AS can_update_organization,
           has_table_privilege(current_user, 'public."Organization"', 'DELETE') AS can_delete_organization,
           has_table_privilege(current_user, 'public."AuditEvent"', 'INSERT') AS can_insert_audit,
           has_table_privilege(current_user, 'public."AuditEvent"', 'UPDATE') AS can_update_audit,
           has_table_privilege(current_user, 'public."AuditEvent"', 'DELETE') AS can_delete_audit
      FROM pg_roles r WHERE r.rolname = current_user
  `;
  return validateDemoPreflightPrivileges(rows);
}

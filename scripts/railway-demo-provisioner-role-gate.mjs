// Read-only inspection of the dedicated Railway demo provisioner database role.
// This module never grants privileges, creates users, or modifies data.
export const APPROVED_DEMO_PROVISIONER_DB_ROLE = "trace_demo_provisioner";

export function validateDemoProvisionerRole(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Demo provisioner: expected exactly one role inspection row");
  }
  const r = rows[0];
  if (r.database_user !== APPROVED_DEMO_PROVISIONER_DB_ROLE ||
      r.is_superuser !== false || r.can_create_db !== false ||
      r.can_create_role !== false || r.can_replicate !== false ||
      r.bypass_rls !== false || r.transaction_read_only !== "on") {
    throw new Error("Demo provisioner: database role is not approved for read-only preparation");
  }
  return { role: r.database_user, verifiedReadOnly: true, writesPerformed: 0 };
}

export async function inspectDemoProvisionerRole(db) {
  if (!db || typeof db.$queryRaw !== "function") throw new Error("Demo provisioner: database client required");
  const rows = await db.$queryRaw`
    SELECT current_user AS database_user,
           r.rolsuper AS is_superuser,
           r.rolcreatedb AS can_create_db,
           r.rolcreaterole AS can_create_role,
           r.rolreplication AS can_replicate,
           r.rolbypassrls AS bypass_rls,
           current_setting('transaction_read_only') AS transaction_read_only
      FROM pg_roles r WHERE r.rolname = current_user
  `;
  return validateDemoProvisionerRole(rows);
}

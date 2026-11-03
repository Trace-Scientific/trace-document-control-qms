// Read-only structural inspection of demo provisioning tables; no connection or mutation.
const expected = ["Organization", "AuditEvent"];
export function validateDemoProvisioningStructure(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("Demo structure: missing catalog rows");
  const tables = new Map(expected.map(name => [name, { columns: [], constraints: [] }]));
  const seen = new Set();
  for (const r of rows) {
    if (!r || !tables.has(r.table_name) || !["column", "constraint"].includes(r.kind) ||
        typeof r.name !== "string" || !r.name ||
        typeof r.definition !== "string" || !r.definition) throw new Error("Demo structure: unexpected catalog row");
    const key = r.table_name + ":" + r.kind + ":" + r.name;
    if (seen.has(key)) throw new Error("Demo structure: duplicate catalog row");
    seen.add(key);
    tables.get(r.table_name)[r.kind === "column" ? "columns" : "constraints"].push({ name: r.name, definition: r.definition });
  }
  for (const [name, info] of tables) {
    if (!info.columns.length || !info.constraints.length) throw new Error("Demo structure: incomplete " + name);
  }
  return { mode: "READ_ONLY", writesPerformed: 0, tables: expected.map(name => ({ table: name, ...tables.get(name) })) };
}
export async function inspectDemoProvisioningStructure(db) {
  if (!db || typeof db.$queryRaw !== "function") throw new Error("Demo structure: database client required");
  const rows = await db.$queryRaw`
    SELECT c.relname AS table_name, 'column'::text AS kind,
           a.attname AS name,
           format('type=%s;not_null=%s;default=%s', format_type(a.atttypid,a.atttypmod),a.attnotnull,COALESCE(pg_get_expr(d.adbin,d.adrelid),'<none>')) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
     WHERE n.nspname='public' AND c.relname IN ('Organization','AuditEvent') AND c.relkind='r'
    UNION ALL
    SELECT c.relname AS table_name, 'constraint'::text AS kind,
           k.conname AS name, pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('Organization','AuditEvent') AND c.relkind='r'
    ORDER BY table_name, kind, name
  `;
  return validateDemoProvisioningStructure(rows);
}

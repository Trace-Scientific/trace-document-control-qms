// Read-only inspection of uniqueness enforcement for the synthetic demo login code.
// PostgreSQL can enforce uniqueness using a standalone unique index, not only a UNIQUE constraint.
export function validateDemoLoginCodeIndexes(rows) {
  if (!Array.isArray(rows)) throw new Error("Demo indexes: invalid catalog response");
  const seen = new Set();
  const indexes = rows.map(r => {
    if (!r || typeof r.index_name !== "string" || !r.index_name ||
        typeof r.index_definition !== "string" || !r.index_definition ||
        typeof r.is_unique !== "boolean" || typeof r.is_valid !== "boolean" ||
        typeof r.is_ready !== "boolean" || typeof r.is_partial !== "boolean" ||
        typeof r.is_expression !== "boolean" || typeof r.is_single_key !== "boolean" ||
        typeof r.key_column !== "string" || seen.has(r.index_name)) {
      throw new Error("Demo indexes: malformed or duplicate catalog row");
    }
    seen.add(r.index_name);
    return {
      name: r.index_name, definition: r.index_definition,
      usableUniqueLoginCode: r.is_unique && r.is_valid && r.is_ready &&
        !r.is_partial && !r.is_expression && r.is_single_key &&
        (r.key_column === '"loginCode"' || r.key_column === "loginCode"),
    };
  });
  return {
    mode: "READ_ONLY", writesPerformed: 0, table: "Organization",
    loginCodeUniquenessVerified: indexes.some(i => i.usableUniqueLoginCode),
    indexes,
  };
}
export async function inspectDemoLoginCodeIndexes(db) {
  if (!db || typeof db.$queryRaw !== "function") throw new Error("Demo indexes: database client required");
  const rows = await db.$queryRaw`
    SELECT idx.relname AS index_name,
           pg_get_indexdef(i.indexrelid) AS index_definition,
           i.indisunique AS is_unique, i.indisvalid AS is_valid,
           i.indisready AS is_ready, (i.indpred IS NOT NULL) AS is_partial,
           (i.indexprs IS NOT NULL) AS is_expression,
           (i.indnkeyatts = 1) AS is_single_key,
           pg_get_indexdef(i.indexrelid, 1, true) AS key_column
      FROM pg_index i
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      JOIN pg_class idx ON idx.oid = i.indexrelid
     WHERE ns.nspname = 'public' AND tbl.relname = 'Organization' AND tbl.relkind = 'r'
     ORDER BY idx.relname
  `;
  return validateDemoLoginCodeIndexes(rows);
}

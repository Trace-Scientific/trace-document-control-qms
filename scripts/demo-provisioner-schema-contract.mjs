// Pure, offline contract validation. No database connection, SQL execution, or writes.
// Input is the read-only structure report from the attested demo preflight.
const required = {
  Organization: ["id", "loginCode", "legalName", "displayName", "timezone", "active"],
  AuditEvent: ["id", "organizationId", "action", "entityType", "entityId", "metadata", "occurredAt"],
};
export function validateDemoCreationSchemaContract(report) {
  if (!report || report.mode !== "READ_ONLY" || report.writesPerformed !== 0 ||
      !Array.isArray(report.tables) || report.tables.length !== 2) {
    throw new Error("Demo contract: expected complete read-only structure report");
  }
  const result = {};
  for (const [name, fields] of Object.entries(required)) {
    const table = report.tables.find(t => t.table === name);
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.constraints)) {
      throw new Error("Demo contract: missing table " + name);
    }
    const columns = new Map();
    for (const col of table.columns) {
      if (!col || typeof col.name !== "string" || typeof col.definition !== "string" || columns.has(col.name)) {
        throw new Error("Demo contract: invalid or duplicate column in " + name);
      }
      columns.set(col.name, col.definition);
    }
    for (const field of fields) {
      if (!columns.has(field)) throw new Error("Demo contract: missing " + name + "." + field);
    }
    const id = columns.get("id");
    if (!id.includes("type=uuid;") || !id.includes("not_null=t") ||
        !id.includes("default=gen_random_uuid()")) {
      throw new Error("Demo contract: unexpected UUID primary key default in " + name);
    }
    if (!table.constraints.some(c => c.name === name + "_pkey" && c.definition === "PRIMARY KEY (id)")) {
      throw new Error("Demo contract: missing primary key in " + name);
    }
    result[name] = { requiredColumns: fields.length, primaryKeyVerified: true };
  }
  const org = report.tables.find(t => t.table === "Organization");
  if (!org.constraints.some(c => /UNIQUE/.test(c.definition) && /loginCode/.test(c.definition))) {
    throw new Error("Demo contract: missing unique loginCode constraint");
  }
  const audit = report.tables.find(t => t.table === "AuditEvent");
  if (!audit.constraints.some(c => /FOREIGN KEY/.test(c.definition) &&
      /organizationId/.test(c.definition) && /REFERENCES "Organization"\(id\)/.test(c.definition))) {
    throw new Error("Demo contract: missing audit organization foreign key");
  }
  if (!audit.columns.find(c => c.name === "metadata").definition.includes("type=jsonb;not_null=t")) {
    throw new Error("Demo contract: audit metadata must be required JSONB");
  }
  return { mode: "OFFLINE_VALIDATION", writesPerformed: 0, schemaContractPassed: true, tables: result };
}

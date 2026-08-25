const sensitiveKey = /authorization|cookie|password|secret|token|database_url/i;

export function operationalEvent(
  event: string,
  fields: Record<string, unknown> = {},
) {
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : scalar(value),
    ]),
  );
  return JSON.stringify({
    ...safeFields,
    level: "info",
    event,
    occurredAt: new Date().toISOString(),
  });
}

function scalar(value: unknown) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  return "[OMITTED]";
}

import { describe, expect, it } from "vitest";
import { operationalEvent } from "./telemetry";

describe("operational telemetry", () => {
  it("emits structured scalar fields and redacts sensitive values", () => {
    const event = JSON.parse(
      operationalEvent("readiness_failed", {
        dependency: "database",
        authorization: "Bearer value",
        sessionToken: "secret-token",
        nested: { unsafe: true },
      }),
    );
    expect(event).toMatchObject({
      level: "info",
      event: "readiness_failed",
      dependency: "database",
      authorization: "[REDACTED]",
      sessionToken: "[REDACTED]",
      nested: "[OMITTED]",
    });
    expect(JSON.stringify(event)).not.toContain("secret-token");
  });
});

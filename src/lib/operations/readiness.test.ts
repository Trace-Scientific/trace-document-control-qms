import { describe, expect, it } from "vitest";
import { checkReadiness } from "./readiness";

describe("service readiness", () => {
  it("reports ready only when every dependency responds", async () => {
    await expect(
      checkReadiness(
        [{ name: "database", async check() {} }],
        new Date("2026-08-25T16:00:00Z"),
      ),
    ).resolves.toEqual({
      status: "ready",
      checkedAt: "2026-08-25T16:00:00.000Z",
      checks: [{ name: "database", status: "ok" }],
    });
  });
  it("returns a generic unavailable result without leaking errors", async () => {
    const result = await checkReadiness([
      {
        name: "database",
        async check() {
          throw new Error("postgresql://secret@internal-host/qms");
        },
      },
    ]);
    expect(result.status).toBe("not_ready");
    expect(JSON.stringify(result)).not.toContain("internal-host");
  });
});

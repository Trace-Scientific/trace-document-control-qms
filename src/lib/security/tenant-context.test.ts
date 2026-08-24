import { describe, expect, it } from "vitest";
import { deriveTenantContext } from "./tenant-context";
import type { SessionRecord } from "./session";

const session: SessionRecord = {
  id: "session-1",
  organizationId: "org-trusted",
  userId: "user-1",
  tokenHash: "0".repeat(64),
  idleExpiresAt: new Date("2026-08-25T00:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-08-26T00:00:00.000Z"),
  revokedAt: null,
};

describe("tenant context", () => {
  it("derives identity exclusively from the validated server-side session", () => {
    expect(deriveTenantContext(session)).toEqual({
      organizationId: "org-trusted",
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  it("rejects a client-requested tenant override", () => {
    expect(() => deriveTenantContext(session, "org-attacker")).toThrow("Access denied");
  });
});

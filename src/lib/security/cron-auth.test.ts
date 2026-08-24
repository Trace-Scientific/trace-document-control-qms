import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

describe("cron authentication", () => {
  const secret = "a-secure-overdue-monitor-secret-123456";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCronRequest("Bearer wrong", secret)).toBe(false);
    expect(isAuthorizedCronRequest(null, secret)).toBe(false);
  });
  it("fails closed for missing or weak configuration", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short", "short")).toBe(false);
  });
});

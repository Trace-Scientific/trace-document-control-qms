import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { retrySerializableEnrollment } from "./mfa-enrollment-serializable";

function conflict() {
  return new Prisma.PrismaClientKnownRequestError("Concurrent transaction conflict", {
    code: "P2034", clientVersion: "test",
  });
}

describe("MFA enrollment serializable transaction retries", () => {
  it("succeeds without retries", async () => {
    const operation = vi.fn().mockResolvedValue(true);
    await expect(retrySerializableEnrollment(operation)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("retries P2034 conflicts and re-executes the operation", async () => {
    const operation = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce(true);
    await expect(retrySerializableEnrollment(operation)).resolves.toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });
  it("stops after three write conflicts", async () => {
    const operation = vi.fn().mockImplementation(async () => { throw conflict(); });
    await expect(retrySerializableEnrollment(operation)).rejects.toMatchObject({ code: "P2034" });
    expect(operation).toHaveBeenCalledTimes(3);
  });
  it("never retries unrelated database errors", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Database unavailable"));
    await expect(retrySerializableEnrollment(operation)).rejects.toThrow("Database unavailable");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

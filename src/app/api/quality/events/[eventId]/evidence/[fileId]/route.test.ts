import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), find: vi.fn(), get: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: mocks.authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/quality/evidence-download", () => ({ findQualityEvidenceFile: mocks.find }));
vi.mock("@/lib/storage/s3", () => ({ PrivateObjectStorage: class { get = mocks.get; } }));
vi.mock("@/lib/db", () => ({ db: { auditEvent: { create: mocks.audit } } }));

const organizationId = randomUUID();
const userId = randomUUID();
const eventId = randomUUID();
const fileId = randomUUID();
const bytes = Buffer.from("Synthetic quality evidence");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const context = (permissions: string[]): AuthorizationContext => ({
  organizationId, userId, userState: "ACTIVE",
  grants: permissions.map(permission => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
});
const request = () => GET(new NextRequest("https://qms.example.test/evidence"), { params: Promise.resolve({ eventId, fileId }) });

describe("quality evidence download", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockResolvedValue(context(["quality_event.read"]));
    mocks.find.mockResolvedValue({ id: fileId, sha256, storageKey: "private/evidence", originalName: "Quality report.txt" });
    mocks.get.mockResolvedValue(bytes);
  });

  it("requires quality permission before checking any file association", async () => {
    mocks.authenticate.mockResolvedValue(context(["document.read"]));
    expect((await request()).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("serves a verified attachment and records access to the event evidence", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(bytes.toString());
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Quality-report.txt"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.find).toHaveBeenCalledWith(organizationId, eventId, fileId, false);
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId, actorUserId: userId, action: "FILE_DOWNLOADED", entityId: fileId,
      newHash: sha256, metadata: { evidenceDomain: "QUALITY", qualityEventId: eventId },
    }) });
  });

  it("preserves existing document access for a legacy linked file", async () => {
    mocks.authenticate.mockResolvedValue(context(["quality_event.read", "document.read"]));
    expect((await request()).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(organizationId, eventId, fileId, true);
  });

  it("does not fetch an unavailable file or release bytes with a mismatched hash", async () => {
    mocks.find.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce(Buffer.from("Different contents"));
    expect((await request()).status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("withholds the attachment if the download audit write fails", async () => {
    mocks.audit.mockRejectedValueOnce(new Error("Audit write failed"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-disposition")).toBeNull();
  });
});

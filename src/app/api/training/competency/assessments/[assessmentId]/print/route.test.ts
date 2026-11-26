import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET } from "./route";

const { authenticate, query, audit, observations, signature } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(), query: vi.fn(), audit: vi.fn(),
  observations: vi.fn(), signature: vi.fn(),
}));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate, AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: query, auditEvent: { create: audit } } }));
vi.mock("@/lib/training/competency-store", () => ({
  PrismaCompetencyStore: class { readAssessmentObservations = observations; readAssessmentSignature = signature; },
}));

const organizationId = "19edf975-eb67-47f2-b3bf-b8d20653e72c";
const userId = "8e9e58da-a20e-48f8-8576-9ad5332a233f";
const assessmentId = "20f20594-7dbf-472e-bc0b-0e480cf07a63";
const context: AuthorizationContext = {
  organizationId, userId, userState: "ACTIVE",
  grants: ["training.read", "personnel.read"].map((permission) => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
};
const request = () => new NextRequest(`https://qms.example.test/api/training/competency/assessments/${assessmentId}/print`);
const params = () => ({ params: Promise.resolve({ assessmentId }) });

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(context);
  query.mockReset().mockResolvedValue([]);
  audit.mockReset().mockResolvedValue({});
  observations.mockReset().mockResolvedValue([]);
  signature.mockReset().mockResolvedValue(null);
});

it("checks training and personnel permissions before reading personal details", async () => {
  authenticate.mockResolvedValue({ ...context, grants: context.grants.filter((grant) => grant.permission === "training.read") });
  expect((await GET(request(), params())).status).toBe(403);
  expect(query).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it("uses the session tenant and returns no audit or details for a missing assessment", async () => {
  expect((await GET(request(), params())).status).toBe(404);
  expect(query.mock.calls[0].slice(-2)).toEqual([organizationId, assessmentId]);
  expect(observations).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it("renders escaped printable details with an audit event and no caching", async () => {
  query.mockResolvedValue([{
    id: assessmentId, organizationName: "Demo & Lab", employeeNumber: "TEST-001", employeeName: "<b>Demo User</b>",
    programCode: "COMP-01", programTitle: "Demo method", scopeLabel: "Test system: Demo",
    assessorName: "Synthetic Evaluator", assessorUserId: userId, assessedAt: new Date("2026-01-03T10:01:02Z"),
    expiresOn: "2027-01-03", outcome: "QUALIFIED", previousAssessmentAt: new Date("2025-09-01T10:01:02Z"),
    notes: "Assessment note", fileId: "synthetic-file", fileName: "observation.pdf",
  }]);
  observations.mockResolvedValue([{ elementId: "method-1", code: "OBS-01", title: "Observation", outcome: "PASS", notes: "<script>escape</script>" }]);
  signature.mockResolvedValue({ status: "INVALIDATED", meaningText: "Verification", signedAt: new Date("2026-01-03T11:01:02Z"), signerUserId: userId });
  const response = await GET(request(), params());
  const page = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(page).toContain("&lt;b&gt;Demo User&lt;/b&gt;");
  expect(page).toContain("&lt;script&gt;escape&lt;/script&gt;");
  expect(page).not.toContain("<script>");
  expect(page).toContain("Signature invalidated");
  expect(page).toContain("observation.pdf");
  expect(page).toContain("Prior assessment");
  expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({
    organizationId, actorUserId: userId, entityId: assessmentId, action: "COMPETENCY_ASSESSMENT_PRINT_VIEW_GENERATED",
  }) });
});

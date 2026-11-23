import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET, POST } from "./route";

const fake = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    fileObject: { findMany: fake.findMany, findFirst: fake.findFirst, updateMany: fake.updateMany },
    auditEvent: { create: fake.audit },
  };
  return { db: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock("@/lib/storage/s3", () => ({ PrivateObjectStorage: class { get = fake.get; } }));

const fileId = "26db892d-5677-4b58-8a0e-d5fc4cae16b0";
const organizationId = "19edf975-eb67-47f2-b3bf-b8d20653e72c";
const token = "test-only-dedicated-file-scan-secret";
const url = "https://qms.example.test/api/internal/files/demo-scan";
const headers = { Authorization: `Bearer ${token}` };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DEMO_FILE_SCAN_SECRET", token);
  vi.stubEnv("DEPLOYMENT_TIER", "demo");
  vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "demo");
});
afterEach(() => vi.unstubAllEnvs());

test("refuses the general cron secret when the file scan secret is absent", async () => {
  vi.stubEnv("DEMO_FILE_SCAN_SECRET", undefined);
  vi.stubEnv("CRON_SECRET", token);
  expect((await GET(new NextRequest(url, { headers }))).status).toBe(404);
  expect((await POST(new NextRequest(url, { headers, method: "POST" }))).status).toBe(404);
  expect(fake.findMany).not.toHaveBeenCalled();
  expect(fake.findFirst).not.toHaveBeenCalled();
});

test("only lists pending files for the active demo tenant in the demo environment", async () => {
  fake.findMany.mockResolvedValue([{ id: fileId, organizationId }]);
  const response = await GET(new NextRequest(url, { headers }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fake.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { status: "PENDING_SCAN", organization: { loginCode: "trace-demo-lab", active: true } },
  }));
  vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
  expect((await GET(new NextRequest(url, { headers }))).status).toBe(404);
  expect((await POST(new NextRequest(url, { headers, method: "POST" }))).status).toBe(404);
  expect(fake.findMany).toHaveBeenCalledTimes(1);
});

test("checks the pending object's content hash before handing bytes to the scanner", async () => {
  const bytes = new TextEncoder().encode("synthetic evidence");
  fake.findFirst.mockResolvedValue({
    storageKey: `${organizationId}/${fileId}/evidence.txt`, organizationId,
    sizeBytes: BigInt(bytes.length), sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  fake.get.mockResolvedValueOnce(bytes).mockResolvedValueOnce(new Uint8Array(bytes.length));
  const request = () => new NextRequest(`${url}?fileId=${fileId}`, { headers });
  expect(await (await GET(request())).text()).toBe("synthetic evidence");
  expect((await GET(request())).status).toBe(409);
});

test.each([["CLEAN", "AVAILABLE"], ["MALICIOUS", "QUARANTINED"]])(
  "records a %s outcome once with an audit event",
  async (result, status) => {
    fake.findFirst.mockResolvedValue({ id: fileId, organizationId, sha256: "hash" });
    fake.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const request = () => new NextRequest(url, {
      method: "POST", headers, body: JSON.stringify({ fileId, organizationId, result }),
    });
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(404);
    expect(fake.updateMany).toHaveBeenCalledWith({
      where: { id: fileId, organizationId, status: "PENDING_SCAN", sha256: "hash",
        organization: { loginCode: "trace-demo-lab", active: true } },
      data: { status },
    });
    expect(fake.audit).toHaveBeenCalledTimes(1);
  },
);

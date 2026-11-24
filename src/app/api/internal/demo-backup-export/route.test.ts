import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
const { findFirst, get } = vi.hoisted(() => ({ findFirst: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { fileObject: { findFirst } } }));
vi.mock("@/lib/storage/s3", () => ({ PrivateObjectStorage: class { get = get; } }));
import { GET } from "./route";

const id = "502d9cb2-2280-4f80-899e-e9a45f664101";
const organizationId = "32e089a4-1deb-4db1-aa29-6c9b12e3ceb1";
const secret = "synthetic-test-secret-not-a-real-credential";
const bytes = Buffer.from("fixture");
const file = { id, organizationId, originalName: "fixture.txt",
  storageKey: organizationId + "/" + id + "/fixture.txt",
  sizeBytes: BigInt(bytes.length), sha256: createHash("sha256").update(bytes).digest("hex") };
const request = (token = secret, fileId = id) => new Request("https://example.invalid/api/internal/demo-backup-export?id=" + fileId, { headers: { authorization: "Bearer " + token } });
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
test("fails closed outside demo and without valid dedicated credentials", async () => {
  vi.stubEnv("DEPLOYMENT_TIER", "production");
  vi.stubEnv("DEMO_BACKUP_EXPORT_SECRET", secret);
  expect((await GET(request())).status).toBe(404);
  vi.stubEnv("DEPLOYMENT_TIER", "demo");
  expect((await GET(request("wrong"))).status).toBe(401);
  expect((await GET(request(secret, "bad"))).status).toBe(400);
  expect(findFirst).not.toHaveBeenCalled();
});
test("exports only verified available files from the active synthetic tenant", async () => {
  vi.stubEnv("DEPLOYMENT_TIER", "demo");
  vi.stubEnv("DEMO_BACKUP_EXPORT_SECRET", secret);
  findFirst.mockResolvedValue(file);
  get.mockResolvedValue(bytes);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(findFirst).toHaveBeenCalledWith({ where: { id, status: "AVAILABLE", organization: { loginCode: "trace-demo-lab", active: true } } });
  get.mockResolvedValue(Buffer.from("corrupt"));
  expect((await GET(request())).status).toBe(409);
  findFirst.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(404);
});

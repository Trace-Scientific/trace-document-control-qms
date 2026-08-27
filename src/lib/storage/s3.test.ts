import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateObjectStorage } from "./s3";
const original = { ...process.env };
describe("private S3-compatible storage", () => {
  beforeEach(() => { Object.assign(process.env, { OBJECT_STORAGE_ENDPOINT: "https://objects.example.test", OBJECT_STORAGE_REGION: "us-west-2", OBJECT_STORAGE_BUCKET: "private-qms", OBJECT_STORAGE_ACCESS_KEY_ID: "test-access", OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret" }); });
  afterEach(() => { process.env = { ...original }; vi.unstubAllGlobals(); });
  it("signs private uploads without exposing credentials in the URL", async () => { const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetchMock); await new PrivateObjectStorage().put("org/file/report 1.pdf", new TextEncoder().encode("synthetic"), "application/pdf"); const [url, init] = fetchMock.mock.calls[0]; expect(String(url)).toBe("https://objects.example.test/private-qms/org/file/report%201.pdf"); expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=test-access/"); expect(String(url)).not.toContain("test-secret"); });
  it("returns exact bytes from an authenticated private download", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("synthetic", { status: 200 }))); expect(new TextDecoder().decode(await new PrivateObjectStorage().get("org/file.txt"))).toBe("synthetic"); });
});

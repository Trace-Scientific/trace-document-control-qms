import { createHash, createHmac } from "node:crypto";
import { getObjectStorageEnv } from "../env";
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();

export class PrivateObjectStorage {
  private readonly config = getObjectStorageEnv();
  private async request(method: "GET" | "PUT" | "DELETE", key: string, body?: Uint8Array, mimeType?: string) {
    const endpoint = new URL(this.config.OBJECT_STORAGE_ENDPOINT);
    const path = `/${encodeURIComponent(this.config.OBJECT_STORAGE_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), date = amzDate.slice(0, 8), payloadHash = sha256(body ?? new Uint8Array());
    const headers: Record<string, string> = { host: endpoint.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    if (mimeType) headers["content-type"] = mimeType;
    const names = Object.keys(headers).sort(), canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
    const canonical = [method, path, "", canonicalHeaders, names.join(";"), payloadHash].join("\n"), scope = `${date}/${this.config.OBJECT_STORAGE_REGION}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.config.OBJECT_STORAGE_SECRET_ACCESS_KEY}`, date), this.config.OBJECT_STORAGE_REGION), "s3"), "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.OBJECT_STORAGE_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names.join(";")}, Signature=${createHmac("sha256", signingKey).update(stringToSign).digest("hex")}`;
    const response = await fetch(new URL(path, endpoint), { method, headers, body: body ? Buffer.from(body) : undefined, cache: "no-store" });
    if (!response.ok) throw new Error("Private object storage request failed");
    return response;
  }
  async put(key: string, bytes: Uint8Array, mimeType: string) { await this.request("PUT", key, bytes, mimeType); }
  async get(key: string) { return new Uint8Array(await (await this.request("GET", key)).arrayBuffer()); }
  async remove(key: string) { await this.request("DELETE", key); }
}

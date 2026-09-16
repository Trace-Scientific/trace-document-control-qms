import { createHash, createHmac } from "node:crypto";
import { PlatformIntegrationConfigurationError, type PlatformCredentialResolver } from "./integration-framework";

const REFERENCE_PATTERN = /^aws-sm:\/\/(trace-qms\/(validation|production)\/integrations\/[A-Za-z0-9/_+=.@-]{1,180})$/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SECRET_BYTES = 64 * 1024;

type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type CacheEntry = { value: string; expiresAt: number };

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function amzDates(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function requireRegion() {
  const region = (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "").trim();
  if (region !== "us-west-1") {
    throw new PlatformIntegrationConfigurationError("AWS integration secret region is not configured for the governed release region");
  }
  return region;
}

function validateReference(reference: string) {
  const match = REFERENCE_PATTERN.exec(reference);
  if (!match) throw new PlatformIntegrationConfigurationError("Credential reference is not an approved AWS integration secret reference");
  const deploymentEnvironment = process.env.TRACE_DEPLOYMENT_ENV?.trim();
  if (!deploymentEnvironment || !["validation", "production"].includes(deploymentEnvironment)) {
    throw new PlatformIntegrationConfigurationError("Governed deployment environment is not configured");
  }
  if (deploymentEnvironment !== match[2]) {
    throw new PlatformIntegrationConfigurationError("Credential reference does not match the governed deployment environment");
  }
  return { secretId: match[1] };
}

async function readEcsTaskCredentials(): Promise<AwsCredentials> {
  const relative = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim();
  const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim();
  let url: URL;

  if (relative) {
    if (!relative.startsWith("/")) throw new PlatformIntegrationConfigurationError("AWS task credential endpoint is invalid");
    url = new URL(`http://169.254.170.2${relative}`);
  } else if (full) {
    url = new URL(full);
    if (url.protocol !== "http:" || !["169.254.170.2", "127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new PlatformIntegrationConfigurationError("AWS task credential endpoint is not approved");
    }
  } else {
    throw new PlatformIntegrationConfigurationError("AWS task-role credentials are unavailable");
  }

  const headers = new Headers();
  const token = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN?.trim();
  if (token) headers.set("Authorization", token);

  const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
  if (!response.ok) throw new PlatformIntegrationConfigurationError("AWS task-role credentials could not be resolved");
  const data = await response.json() as Record<string, unknown>;
  const accessKeyId = typeof data.AccessKeyId === "string" ? data.AccessKeyId : "";
  const secretAccessKey = typeof data.SecretAccessKey === "string" ? data.SecretAccessKey : "";
  const sessionToken = typeof data.Token === "string" ? data.Token : undefined;
  if (!accessKeyId || !secretAccessKey) throw new PlatformIntegrationConfigurationError("AWS task-role credentials are incomplete");
  return { accessKeyId, secretAccessKey, sessionToken };
}

async function getSecretValue(secretId: string, credentials: AwsCredentials, region: string) {
  const service = "secretsmanager";
  const host = `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const body = JSON.stringify({ SecretId: secretId });
  const { amzDate, dateStamp } = amzDates(new Date());
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:secretsmanager.GetSecretValue\n${credentials.sessionToken ? `x-amz-security-token:${credentials.sessionToken}\n` : ""}`;
  const signedHeaders = `content-type;host;x-amz-date;x-amz-target${credentials.sessionToken ? ";x-amz-security-token" : ""}`;
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256(body)].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers({
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Date": amzDate,
    "X-Amz-Target": "secretsmanager.GetSecretValue",
    "Authorization": authorization,
  });
  if (credentials.sessionToken) headers.set("X-Amz-Security-Token", credentials.sessionToken);

  const response = await fetch(endpoint, { method: "POST", headers, body, cache: "no-store" });
  if (!response.ok) throw new PlatformIntegrationConfigurationError("AWS integration credential could not be resolved");
  const data = await response.json() as Record<string, unknown>;
  if (typeof data.SecretString !== "string" || !data.SecretString) {
    throw new PlatformIntegrationConfigurationError("AWS integration credential is not a supported string secret");
  }
  if (Buffer.byteLength(data.SecretString, "utf8") > MAX_SECRET_BYTES) {
    throw new PlatformIntegrationConfigurationError("AWS integration credential exceeds the allowed size");
  }
  return data.SecretString;
}

export class AwsSecretsManagerPlatformCredentialResolver implements PlatformCredentialResolver {
  private readonly cache = new Map<string, CacheEntry>();

  async resolve(reference: string | null): Promise<string | null> {
    if (!reference) return null;
    const { secretId } = validateReference(reference);
    const cached = this.cache.get(reference);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;

    const region = requireRegion();
    const credentials = await readEcsTaskCredentials();
    const value = await getSecretValue(secretId, credentials, region);
    this.cache.set(reference, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }
}

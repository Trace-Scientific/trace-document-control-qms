import {
  PlatformOAuthReauthorizationRequiredError,
  oauthCredentialRecord,
  oauthCredentialText,
  sanitizedOAuthCredential,
  type PlatformOAuthProvider,
} from "./oauth-provider";

function approvedSalesforceOrigin(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be a bare HTTPS origin`);
  }
  if (!(hostname === "login.salesforce.com" || hostname === "test.salesforce.com" || hostname.endsWith(".my.salesforce.com") || hostname.endsWith(".sandbox.my.salesforce.com"))) {
    throw new Error(`${label} host is not allowed`);
  }
  return url.origin;
}

function basic(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

async function classifyOAuthFailure(response: Response, label: string): Promise<never> {
  let code = "";
  try {
    const body = await response.json() as Record<string, unknown>;
    code = typeof body.error === "string" ? body.error : "";
  } catch {
    // Provider response body is intentionally not surfaced because it can contain sensitive details.
  }
  if (code === "invalid_grant" || code === "invalid_token") {
    throw new PlatformOAuthReauthorizationRequiredError(`${label} requires reauthorization`);
  }
  throw new Error(`${label} failed with HTTP ${response.status}`);
}

export class SalesforceOAuthProvider implements PlatformOAuthProvider {
  readonly key = "salesforce.oauth";
  readonly adapterKey = "salesforce.crm";

  async refresh(credential: string) {
    const record = oauthCredentialRecord(credential, "Salesforce OAuth credential bundle");
    const clientId = oauthCredentialText(record, "clientId", "Salesforce OAuth client ID", 512);
    const clientSecret = oauthCredentialText(record, "clientSecret", "Salesforce OAuth client secret", 2048);
    const refreshToken = oauthCredentialText(record, "refreshToken", "Salesforce refresh token", 4096);
    const tokenOrigin = approvedSalesforceOrigin(
      typeof record.tokenOrigin === "string" ? record.tokenOrigin : oauthCredentialText(record, "instanceUrl", "Salesforce instance URL", 512),
      "Salesforce OAuth token origin",
    );

    const response = await fetch(`${tokenOrigin}/services/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: basic(clientId, clientSecret),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return classifyOAuthFailure(response, "Salesforce OAuth refresh");

    const payload = await response.json() as Record<string, unknown>;
    const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
    if (!accessToken) throw new Error("Salesforce OAuth refresh response is incomplete");
    const rotatedRefreshToken = typeof payload.refresh_token === "string" && payload.refresh_token.trim()
      ? payload.refresh_token.trim()
      : refreshToken;
    const instanceUrl = approvedSalesforceOrigin(
      typeof payload.instance_url === "string" ? payload.instance_url : oauthCredentialText(record, "instanceUrl", "Salesforce instance URL", 512),
      "Salesforce instance URL",
    );
    const scope = typeof payload.scope === "string" ? payload.scope.trim().split(/\s+/).filter(Boolean) : undefined;

    return {
      credential: JSON.stringify({
        ...record,
        accessToken,
        refreshToken: rotatedRefreshToken,
        instanceUrl,
        tokenOrigin,
        tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
        issuedAt: typeof payload.issued_at === "string" ? payload.issued_at : undefined,
      }),
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      nextRefreshAt: null,
      scopes: scope,
    };
  }

  async revoke(credential: string) {
    const record = oauthCredentialRecord(credential, "Salesforce OAuth credential bundle");
    const refreshToken = oauthCredentialText(record, "refreshToken", "Salesforce refresh token", 4096);
    const instanceUrl = approvedSalesforceOrigin(oauthCredentialText(record, "instanceUrl", "Salesforce instance URL", 512), "Salesforce instance URL");
    const response = await fetch(`${instanceUrl}/services/oauth2/revoke`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return classifyOAuthFailure(response, "Salesforce OAuth revocation");
    return {
      credential: sanitizedOAuthCredential(record, [
        "accessToken",
        "refreshToken",
        "tokenType",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "issuedAt",
      ]),
    };
  }
}

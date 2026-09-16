import {
  PlatformOAuthReauthorizationRequiredError,
  oauthCredentialRecord,
  oauthCredentialText,
  sanitizedOAuthCredential,
  type PlatformOAuthProvider,
} from "./oauth-provider";

const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_ENDPOINT = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

function basic(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function positiveSeconds(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 60 * 60 * 24 * 365) {
    throw new Error(`${label} is invalid`);
  }
  return Math.trunc(number);
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

export class QuickBooksOAuthProvider implements PlatformOAuthProvider {
  readonly key = "quickbooks.oauth";
  readonly adapterKey = "quickbooks.accounting";

  async refresh(credential: string) {
    const record = oauthCredentialRecord(credential, "QuickBooks OAuth credential bundle");
    const clientId = oauthCredentialText(record, "clientId", "QuickBooks OAuth client ID", 512);
    const clientSecret = oauthCredentialText(record, "clientSecret", "QuickBooks OAuth client secret", 2048);
    const refreshToken = oauthCredentialText(record, "refreshToken", "QuickBooks refresh token", 4096);

    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: basic(clientId, clientSecret),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) return classifyOAuthFailure(response, "QuickBooks OAuth refresh");

    const payload = await response.json() as Record<string, unknown>;
    const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
    const nextRefreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
    if (!accessToken || !nextRefreshToken) throw new Error("QuickBooks OAuth refresh response is incomplete");
    const expiresIn = positiveSeconds(payload.expires_in, "QuickBooks access-token lifetime");
    const refreshExpiresIn = positiveSeconds(payload.x_refresh_token_expires_in, "QuickBooks refresh-token lifetime");
    const now = Date.now();
    const accessTokenExpiresAt = new Date(now + expiresIn * 1000);
    const refreshTokenExpiresAt = new Date(now + refreshExpiresIn * 1000);
    const refreshLeadSeconds = Math.min(300, Math.max(60, Math.floor(expiresIn / 4)));
    const nextRefreshAt = new Date(now + Math.max(60, expiresIn - refreshLeadSeconds) * 1000);
    const scope = typeof payload.scope === "string" ? payload.scope.trim().split(/\s+/).filter(Boolean) : undefined;

    const updated = {
      ...record,
      accessToken,
      refreshToken: nextRefreshToken,
      tokenType: typeof payload.token_type === "string" ? payload.token_type : "bearer",
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
    return {
      credential: JSON.stringify(updated),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      nextRefreshAt,
      scopes: scope,
    };
  }

  async revoke(credential: string) {
    const record = oauthCredentialRecord(credential, "QuickBooks OAuth credential bundle");
    const clientId = oauthCredentialText(record, "clientId", "QuickBooks OAuth client ID", 512);
    const clientSecret = oauthCredentialText(record, "clientSecret", "QuickBooks OAuth client secret", 2048);
    const refreshToken = oauthCredentialText(record, "refreshToken", "QuickBooks refresh token", 4096);
    const response = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: basic(clientId, clientSecret),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return classifyOAuthFailure(response, "QuickBooks OAuth revocation");
    return {
      credential: sanitizedOAuthCredential(record, [
        "accessToken",
        "refreshToken",
        "tokenType",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
      ]),
    };
  }
}

import { PlatformIntegrationConfigurationError } from "./integration-framework";

type JsonRecord = Record<string, unknown>;

export type PlatformOAuthRefreshResult = {
  credential: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  nextRefreshAt?: Date | null;
  scopes?: readonly string[];
};

export interface PlatformOAuthProvider {
  readonly key: string;
  readonly adapterKey: string;
  refresh(credential: string): Promise<PlatformOAuthRefreshResult>;
  revoke(credential: string): Promise<{ credential: string }>;
}

export class PlatformOAuthReauthorizationRequiredError extends Error {}

export class PlatformOAuthProviderRegistry {
  constructor(private readonly providers: readonly PlatformOAuthProvider[] = []) {}

  get(key: string) {
    return this.providers.find((provider) => provider.key === key) ?? null;
  }

  forAdapter(adapterKey: string) {
    return this.providers.find((provider) => provider.adapterKey === adapterKey) ?? null;
  }

  listKeys() {
    return this.providers.map((provider) => provider.key).sort();
  }
}

export function oauthCredentialRecord(value: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PlatformIntegrationConfigurationError(`${label} is invalid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformIntegrationConfigurationError(`${label} must be an object`);
  }
  return parsed as JsonRecord;
}

export function oauthCredentialText(record: JsonRecord, key: string, label: string, max = 4096) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new PlatformIntegrationConfigurationError(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

export function sanitizedOAuthCredential(record: JsonRecord, remove: readonly string[]) {
  const sanitized: JsonRecord = { ...record };
  for (const key of remove) delete sanitized[key];
  return JSON.stringify(sanitized);
}

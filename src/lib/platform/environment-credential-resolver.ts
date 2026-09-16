import { PlatformIntegrationConfigurationError, type PlatformCredentialResolver } from "./integration-framework";

const ALLOWED_REFERENCE = /^env:(TRACE_INTEGRATION_[A-Z0-9_]{1,100})$/;

export class EnvironmentPlatformCredentialResolver implements PlatformCredentialResolver {
  async resolve(reference: string | null): Promise<string | null> {
    if (!reference) return null;
    const match = ALLOWED_REFERENCE.exec(reference);
    if (!match) {
      throw new PlatformIntegrationConfigurationError("Credential reference is not an approved integration environment reference");
    }
    const value = process.env[match[1]];
    if (!value) {
      throw new PlatformIntegrationConfigurationError("Referenced integration credential is not configured");
    }
    return value;
  }
}

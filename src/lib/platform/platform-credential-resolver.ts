import {
  PlatformIntegrationConfigurationError,
  type PlatformCredentialResolver,
} from "./integration-framework";
import type { PlatformCredentialStore } from "./credential-store";
import { AwsSecretsManagerPlatformCredentialResolver } from "./aws-secrets-manager-credential-resolver";
import { EnvironmentPlatformCredentialResolver } from "./environment-credential-resolver";

export class GovernedPlatformCredentialResolver implements PlatformCredentialStore {
  constructor(
    private readonly environmentResolver: PlatformCredentialResolver = new EnvironmentPlatformCredentialResolver(),
    private readonly awsResolver: PlatformCredentialStore = new AwsSecretsManagerPlatformCredentialResolver(),
  ) {}

  async resolve(reference: string | null): Promise<string | null> {
    if (!reference) return null;
    if (reference.startsWith("env:")) return this.environmentResolver.resolve(reference);
    if (reference.startsWith("aws-sm://")) return this.awsResolver.resolve(reference);
    throw new PlatformIntegrationConfigurationError("Credential reference scheme is not approved");
  }

  async replace(reference: string, value: string): Promise<void> {
    if (reference.startsWith("aws-sm://")) return this.awsResolver.replace(reference, value);
    if (reference.startsWith("env:")) {
      throw new PlatformIntegrationConfigurationError("Environment credential references are read-only and cannot hold OAuth token lifecycle state");
    }
    throw new PlatformIntegrationConfigurationError("Credential reference scheme is not approved");
  }
}

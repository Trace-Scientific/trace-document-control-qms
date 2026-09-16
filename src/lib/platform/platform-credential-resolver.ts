import {
  PlatformIntegrationConfigurationError,
  type PlatformCredentialResolver,
} from "./integration-framework";
import { AwsSecretsManagerPlatformCredentialResolver } from "./aws-secrets-manager-credential-resolver";
import { EnvironmentPlatformCredentialResolver } from "./environment-credential-resolver";

export class GovernedPlatformCredentialResolver implements PlatformCredentialResolver {
  constructor(
    private readonly environmentResolver = new EnvironmentPlatformCredentialResolver(),
    private readonly awsResolver = new AwsSecretsManagerPlatformCredentialResolver(),
  ) {}

  async resolve(reference: string | null): Promise<string | null> {
    if (!reference) return null;
    if (reference.startsWith("env:")) return this.environmentResolver.resolve(reference);
    if (reference.startsWith("aws-sm://")) return this.awsResolver.resolve(reference);
    throw new PlatformIntegrationConfigurationError("Credential reference scheme is not approved");
  }
}

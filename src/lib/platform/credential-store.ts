import { PlatformIntegrationConfigurationError, type PlatformCredentialResolver } from "./integration-framework";

export interface PlatformCredentialStore extends PlatformCredentialResolver {
  replace(reference: string, value: string): Promise<void>;
}

export class ReadOnlyPlatformCredentialStore implements PlatformCredentialStore {
  constructor(private readonly resolver: PlatformCredentialResolver) {}

  resolve(reference: string | null) {
    return this.resolver.resolve(reference);
  }

  async replace(_reference: string, _value: string): Promise<void> {
    throw new PlatformIntegrationConfigurationError("Credential reference is read-only in this deployment");
  }
}

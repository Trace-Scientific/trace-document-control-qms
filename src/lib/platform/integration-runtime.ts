import { PlatformIntegrationRegistry, PlatformIntegrationService, UnavailableCredentialResolver } from "./integration-framework";

// Provider-specific PRs register adapters here through an explicit reviewed composition change.
// PR 10 intentionally ships with no provider adapters and no credential backend.
export const platformIntegrationRegistry = new PlatformIntegrationRegistry([]);
export const platformCredentialResolver = new UnavailableCredentialResolver();
export const platformIntegrationService = new PlatformIntegrationService(
  platformIntegrationRegistry,
  platformCredentialResolver,
);

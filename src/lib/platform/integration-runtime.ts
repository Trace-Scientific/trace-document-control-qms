import { PlatformIntegrationRegistry, PlatformIntegrationService } from "./integration-framework";
import { EnvironmentPlatformCredentialResolver } from "./environment-credential-resolver";
import { StripeBillingAdapter } from "./stripe-adapter";
import { QuickBooksAccountingAdapter } from "./quickbooks-adapter";
import { SalesforceCrmAdapter } from "./salesforce-adapter";

// Provider adapters are registered only through explicit reviewed composition changes.
export const platformIntegrationRegistry = new PlatformIntegrationRegistry([
  new StripeBillingAdapter(),
  new QuickBooksAccountingAdapter(),
  new SalesforceCrmAdapter(),
]);
export const platformCredentialResolver = new EnvironmentPlatformCredentialResolver();
export const platformIntegrationService = new PlatformIntegrationService(
  platformIntegrationRegistry,
  platformCredentialResolver,
);

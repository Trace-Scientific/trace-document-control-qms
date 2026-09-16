import { PlatformIntegrationRegistry, PlatformIntegrationService } from "./integration-framework";
import { GovernedPlatformCredentialResolver } from "./platform-credential-resolver";
import { PlatformOAuthLifecycleService } from "./oauth-lifecycle";
import { PlatformOAuthAuthorizationSessionService } from "./oauth-authorization-session";
import { PlatformOAuthProviderRegistry } from "./oauth-provider";
import { QuickBooksOAuthProvider } from "./quickbooks-oauth-provider";
import { SalesforceOAuthProvider } from "./salesforce-oauth-provider";
import { StripeBillingAdapter } from "./stripe-adapter";
import { QuickBooksAccountingAdapter } from "./quickbooks-adapter";
import { SalesforceCrmAdapter } from "./salesforce-adapter";
import { SendGridEmailAdapter } from "./sendgrid-email-adapter";
import { TwilioSmsAdapter } from "./twilio-sms-adapter";
import { ZendeskSupportAdapter } from "./zendesk-support-adapter";

// Provider adapters are registered only through explicit reviewed composition changes.
export const platformIntegrationRegistry = new PlatformIntegrationRegistry([
  new StripeBillingAdapter(),
  new QuickBooksAccountingAdapter(),
  new SalesforceCrmAdapter(),
  new SendGridEmailAdapter(),
  new TwilioSmsAdapter(),
  new ZendeskSupportAdapter(),
]);

// OAuth providers govern credential refresh/revocation only; they do not grant platform or tenant authority.
export const platformOAuthProviderRegistry = new PlatformOAuthProviderRegistry([
  new QuickBooksOAuthProvider(),
  new SalesforceOAuthProvider(),
]);

export const platformCredentialResolver = new GovernedPlatformCredentialResolver();
export const platformIntegrationService = new PlatformIntegrationService(
  platformIntegrationRegistry,
  platformCredentialResolver,
);
export const platformOAuthLifecycleService = new PlatformOAuthLifecycleService(
  platformOAuthProviderRegistry,
  platformCredentialResolver,
);
export const platformOAuthAuthorizationSessionService = new PlatformOAuthAuthorizationSessionService(
  platformOAuthProviderRegistry,
  platformCredentialResolver,
);

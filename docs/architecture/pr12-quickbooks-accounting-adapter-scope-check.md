# PR 12 Scope Check — QuickBooks Accounting Adapter

## Included

- `quickbooks.accounting` provider adapter.
- Reviewed runtime registration alongside the existing Stripe adapter.
- Opaque deployment-secret credential resolution through the existing environment credential boundary.
- Controlled QuickBooks Online sandbox/production host selection.
- Bounded customer, invoice, and payment create operations.
- Persisted platform delivery idempotency propagated to QuickBooks request identity.
- Raw-body webhook HMAC verification using the Intuit signature header and verifier token.
- Realm/company binding and bounded accounting data-change normalization.
- Regression/security tests and architecture documentation.

## Security invariants

- No tenant `AuthorizationContext` changes.
- No platform RBAC changes.
- QuickBooks is not a platform or tenant authorization authority.
- Credential values are not stored in application data.
- Callers cannot provide arbitrary QuickBooks endpoints or verbs.
- Webhook data is not normalized before signature verification.
- Incoming realm/company identity must match the configured connection.
- Provider events cannot perform electronic signatures, approvals, security-role administration, legal-hold release, or other accountable-user actions.

## Explicit exclusions

- OAuth consent UI.
- Refresh-token persistence or rotation service.
- Production Intuit credential provisioning.
- Vendor/master-data synchronization beyond the bounded customer create operation.
- Bills, expenses, journal entries, payroll, tax, bank feeds, reconciliation, or general-ledger import/export.
- Automatic commission/payment/accounting state mutation.
- Salesforce, Office Ally, email/SMS, or support-system adapters.
- Tenant QMS integration authority changes.

## Validation boundary

Railway remains synthetic-data development preview and must use Intuit sandbox credentials/data only. Protected validation/production remains governed by the AWS release process.

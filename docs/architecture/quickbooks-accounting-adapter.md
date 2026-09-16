# QuickBooks Online Accounting Adapter

Status: provider-specific integration slice after PR 10 framework and PR 11 Stripe adapter.

## Purpose

Add a bounded QuickBooks Online accounting transport without making QuickBooks an authorization authority or regulated QMS system of record.

## Adapter boundary

Adapter key: `quickbooks.accounting`.

The platform integration connection stores only an opaque credential reference. The deployment secret resolver returns a JSON credential bundle containing the current QuickBooks Online access token, realm/company ID, and webhook verifier token. Secret values are not stored in platform integration tables or returned by platform APIs.

OAuth consent, refresh-token persistence, token rotation, and credential provisioning are intentionally outside this slice. They require a dedicated provider credential-management workflow rather than application-table storage.

## Outbound operations

The adapter permits only:

- `quickbooks.customer.create`
- `quickbooks.invoice.create`
- `quickbooks.payment.create`

The QuickBooks host is selected exclusively from controlled connection configuration (`sandbox` or `production`). Callers cannot supply arbitrary URLs or HTTP methods. Create payloads cannot supply `Id` or `SyncToken`.

The platform delivery idempotency key is propagated in the QuickBooks request ID header so retries reuse the same request identity.

## Inbound webhook verification

The exact raw request body is verified before JSON normalization. The adapter computes HMAC-SHA256 using the configured webhook verifier token and compares the Base64 digest to the `intuit-signature` header using a timing-safe comparison.

The incoming realm ID must match the configured company. Only bounded accounting entities are normalized: Customer, Invoice, Payment, CreditMemo, and Estimate. Supported operations are Create, Update, Delete, Void, and Merge. Unsupported changes do not become normalized platform events.

A webhook batch becomes one `quickbooks.accounting.data_change` normalized event containing the accepted changes so multi-entity notifications are not lost.

## Authority boundary

QuickBooks cannot satisfy platform permissions or tenant QMS permissions and cannot perform signatures, approvals, role changes, legal-hold release, or other accountable-user actions. Provider data can support later governed accounting synchronization, but internal Trace records remain authoritative for Trace platform/QMS state.

## Validation boundary

Railway remains synthetic-data development preview only. Only Intuit sandbox credentials and synthetic accounting data are permitted there. Protected production credential provisioning remains part of the governed AWS deployment process.

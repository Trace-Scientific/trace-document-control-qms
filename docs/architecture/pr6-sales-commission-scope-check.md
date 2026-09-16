# PR 6 Scope Check — Sales & Commission Foundation

## Included

- Trace-side `SalesRepresentative` profiles linked to platform identities.
- Effective-dated `SalesAssignment` customer attribution with overlap rejection.
- Versioned `CommissionPlan`, `CommissionPlanVersion`, and `CommissionRule` configuration.
- Database immutability for active plan versions and their rules.
- Governed `CommissionAccrual` lifecycle: PENDING -> EARNED -> APPROVED -> PAID.
- Immutable calculation identity and stored rule snapshot per accrual.
- Optimistic locking for commission lifecycle transitions.
- Append-only `CommissionAccrualEvent`, `CommissionAdjustment`, `CommissionPayment`, and `CommissionPaymentItem` records.
- Compensating adjustment/reversal model rather than destructive monetary edits.
- Platform audit writes for sales and commission mutations.
- Separate `platform.sales.*` and `platform.commission.*` authorization.
- Platform Administration shell updated from Planned to Foundation for Sales and Commissions.
- Regression/security tests and architecture documentation.

## Explicitly excluded

- QuickBooks or other accounting-provider integration.
- Payroll-provider integration.
- Stripe or billing-provider triggered commission generation.
- CRM synchronization.
- Commission payout batch automation.
- Tax reporting or payroll withholding.
- Tenant QMS role/permission changes.
- Cross-tenant regulated-data reporting.

## Historical controls

Approved/paid monetary history is not rewritten. Commission corrections are represented as new adjustment/reversal records. Historical accruals retain the exact plan version, rule ID, rule snapshot, sales assignment, source reference, and calculated amount used at creation.

## Environment boundary

Railway remains synthetic-data development preview only. Protected qualification and production remain under the governed AWS path.
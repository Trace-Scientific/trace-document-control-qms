# Sales & Commission Foundation

## Purpose

PR 6 adds the Trace-side commercial sales attribution and commission accounting foundation defined by the approved Platform Expansion Implementation Plan. It remains separate from tenant QMS authorization and regulated tenant records.

## Sales attribution

`SalesRepresentative` links a Trace sales profile to one active `PlatformIdentity`. `SalesAssignment` links that representative to a `CustomerAccount` for an effective date range. The service rejects overlapping assignments for the same customer so attribution is deterministic for a given period.

Sales administration requires `platform.sales.manage`; sales read surfaces require `platform.sales.read`.

## Commission configuration

Commission configuration is versioned:

`CommissionPlan -> CommissionPlanVersion -> CommissionRule`

Rules support percentage or fixed-value foundations. A plan version remains editable while DRAFT. Activation requires at least one rule. Once ACTIVE, the plan version and its rules are protected from UPDATE/DELETE at the database boundary; a new version must be created for future changes.

Commission configuration and monetary operations require `platform.commission.manage`; read surfaces require `platform.commission.read`.

## Commission accrual identity

Each `CommissionAccrual` records:

- sales representative
- effective sales assignment
- customer account
- commission plan version
- commission rule
- source type/reference
- basis amount
- calculated commission amount
- currency
- rule snapshot

The database blocks mutation of that historical calculation basis. This prevents later plan changes from rewriting how a historical commission was calculated.

Automated billing-triggered accrual generation is intentionally excluded from this PR. The current service accepts governed accrual creation and preserves the internal domain model that future integrations will call.

## Lifecycle

The controlled lifecycle is:

`PENDING -> EARNED -> APPROVED -> PAID`

PENDING/EARNED/APPROVED transitions use optimistic locking and append `CommissionAccrualEvent` history. PAID is not a generic transition: it can only be reached through `recordPayment`, which creates immutable `CommissionPayment` and `CommissionPaymentItem` evidence in the same transaction.

## Adjustments and reversals

Historical monetary records are not rewritten. `CommissionAdjustment` stores append-only compensating amounts. A REVERSAL is stored as a negative compensating transaction. Payment uses the approved accrual plus accumulated adjustments to determine the payment amount.

`CommissionAccrualEvent`, `CommissionAdjustment`, `CommissionPayment`, and `CommissionPaymentItem` are protected from UPDATE/DELETE by database triggers.

## Audit

Creation and lifecycle operations also create append-only `PlatformAuditEvent` entries with the real Trace platform actor, reason, entity identity, and structured metadata. No customer employee identity is fabricated.

## Security boundary

This foundation does not alter tenant `Role`, `Permission`, `RolePermission`, `UserRole`, or tenant `AuthorizationContext`. Sales/commission permissions are platform-only capabilities and cannot satisfy tenant QMS authorization.

No QuickBooks, Stripe, payroll provider, CRM, or other vendor is an accounting or authorization authority in this PR. Provider adapters remain future Integration Framework work.

## API foundation

- `GET/POST /api/platform/sales/representatives`
- `GET/POST /api/platform/sales/assignments`
- `POST /api/platform/commissions/plans`
- `POST /api/platform/commissions/plans/{planId}/versions`
- `POST /api/platform/commissions/plan-versions/{versionId}/rules`
- `POST /api/platform/commissions/plan-versions/{versionId}/activate`
- `GET/POST /api/platform/commissions/accruals`
- `POST /api/platform/commissions/accruals/{accrualId}/transition`
- `POST /api/platform/commissions/accruals/{accrualId}/adjustments`
- `POST /api/platform/commissions/accruals/{accrualId}/payment`

## Validation boundary

Railway remains synthetic-data development preview only. Protected qualification/production remains on the governed AWS release path.
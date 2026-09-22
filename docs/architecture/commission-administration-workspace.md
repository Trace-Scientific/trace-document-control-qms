# Commission Administration Workspace

Status: commercial administration usability slice.

## Purpose

Replace the placeholder Commissions cards in Platform Administration with an operational workspace over the existing governed sales-commission domain.

## Configuration workflow

Authorized users with `platform.commission.manage` can:
- create a commission plan;
- create an effective-dated DRAFT plan version;
- add percentage or fixed rules to a DRAFT version; and
- explicitly activate the version after at least one rule exists.

Activated plan versions and their rules remain immutable under the existing database/service controls. Later changes require a new version.

## Accrual workflow

The workspace can create commission accruals from:
- an active sales assignment;
- an active/effective commission rule;
- a source type/reference; and
- a nonnegative basis amount.

Creation preserves a rule snapshot so later rule-version changes do not alter historical commission calculations.

Accruals follow the governed lifecycle:
- PENDING → EARNED;
- EARNED → APPROVED;
- APPROVED → PAID through the payment-recording path.

Optimistic lock versions protect lifecycle transitions and payment recording.

## Adjustments and payments

Adjustments/reversals are separate append-only monetary records with required reasons. Payments are separate payment records/items and mark only approved accruals PAID.

## Permission and data boundary

Workspace visibility requires `platform.commission.read`; mutations require `platform.commission.manage`.

Commission administration remains Trace-side commercial control-plane data. It does not grant tenant access or alter regulated tenant quality records.

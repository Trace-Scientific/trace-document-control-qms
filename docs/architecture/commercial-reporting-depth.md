# Commercial Reporting Depth

Status: commercial administration reporting slice.

## Purpose

Expand the existing governed platform operational snapshot so Platform Administration can report the commercial measures required for launch without introducing a second reporting store.

## Added metrics

Each generated snapshot now includes:
- customers by current sales representative;
- new customers created in the last 30 and 90 days;
- normalized monthly recurring revenue by currency for ACTIVE monthly/annual subscriptions;
- active subscriptions ending within the next 90 days as upcoming renewals;
- cancelled subscription count;
- active subscription plan mix;
- active enabled feature/module mix;
- commission amounts accrued by currency;
- commission amounts paid by currency; and
- existing approved/unpaid commission amount and lifecycle counts.

## Revenue calculation boundary

Monthly recurring revenue is derived only from versioned plan terms on ACTIVE subscriptions:
- MONTHLY base amount contributes its monthly base amount;
- ANNUAL base amount is divided by 12;
- CUSTOM cadence is excluded from normalized MRR because no safe normalization rule is defined.

Amounts remain separated by currency and are not converted using exchange rates.

This snapshot does not attempt to become an accounting ledger or payment-provider financial statement.

## Renewal boundary

The current subscription model does not contain a separate negotiated renewal-date field. Until one is added, the report labels ACTIVE subscriptions with an `endsAt` date in the next 90 days as upcoming renewals. It does not infer renewal dates for open-ended subscriptions.

## Data boundary

The report remains platform control-plane only. It aggregates customer accounts, subscriptions, entitlements, sales attribution, commissions, support, and platform notifications; it does not traverse tenant document, training, quality, laboratory, or other regulated QMS record content.

## Governance

Generation continues to require `platform.reporting.read` and persists the exact result in `PlatformReportRun` with the generating platform identity and membership.

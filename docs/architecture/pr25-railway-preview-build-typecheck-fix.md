# PR 25 — Railway Preview Build Typecheck Fix

## Purpose

Restore the existing Railway development-preview build without weakening TypeScript checks or changing runtime authorization, provider behavior, scheduler behavior, or protected infrastructure.

## Included

- Raise the TypeScript compilation target from ES2017 to ES2020 so existing BigInt literals type-check.
- Declare Vitest globals for repository TypeScript checking so test files using `describe`, `it`, and `expect` are typed correctly.
- Type the published Help Center article raw-query result explicitly instead of relying on Prisma's `unknown` default.
- Align the manual-release API JSON input with the existing `Prisma.InputJsonObject` service contract.

## Excluded

- No database migration.
- No tenant authorization or platform authorization changes.
- No support-access behavior changes.
- No Twilio adapter, callback, polling, scheduler, resend, replay, or reconciliation changes.
- No Railway service provisioning or environment-variable mutation.
- No protected AWS provisioning.
- No relaxation of `strict`, no `ignoreBuildErrors`, and no disabling of Next.js TypeScript checks.

## Validation boundary

Railway remains synthetic-data development preview only and is not formal validation evidence.

# PR 25 Scope Check — Railway Preview Build Typecheck Fix

## Included

- TypeScript target compatibility for existing BigInt usage.
- Vitest global type declarations for repository-wide type checking.
- Explicit typing for the published Help Center article raw query.
- Manual-release applicability typing aligned to the existing Prisma JSON contract.
- Railway preview build troubleshooting documentation.

## Explicitly excluded

- Scheduler activation.
- Provider integration behavior changes.
- SMS send/replay/resend behavior.
- Database schema changes or migrations.
- Tenant/platform authorization changes.
- Protected AWS infrastructure changes.

## Acceptance guardrail

The preview build must succeed without disabling strict TypeScript validation or Next.js build-time type checking.

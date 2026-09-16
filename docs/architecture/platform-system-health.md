# Platform System Health

Status: PR 9 implementation architecture

## Purpose

Provide Trace platform administrators with sanitized, read-only operational visibility without exposing tenant-regulated content, credentials, infrastructure secrets, or raw environment configuration.

## Authorization boundary

The health endpoint is platform-only and requires `platform.health.read` through `PlatformAuthorizationContext`. It does not reuse tenant roles or permissions and does not add any bypass to tenant `AuthorizationContext`.

## Health projection

`PlatformSystemHealthService` returns a fixed allowlisted response containing:

- application readiness;
- bounded release identity when a recognized release identifier is available;
- coarse environment classification;
- database connectivity;
- latest Prisma migration identity and completion time;
- count of incomplete/unresolved migrations;
- platform-notification delivery queue state, including pending/retry/processing/dead-letter and stale five-minute claims;
- scheduled-task configuration state;
- platform integration-framework state.

The projection intentionally does not return exception messages, SQL text, database connection information, hostnames, credentials, tokens, raw environment variables, provider secrets, or tenant-regulated records.

## Environment classification

Only coarse classifications are returned:

- `DEVELOPMENT_PREVIEW`
- `PROTECTED_VALIDATION`
- `PRODUCTION`
- `LOCAL_OR_UNKNOWN`

Railway presence is classified as `DEVELOPMENT_PREVIEW` under the existing project validation boundary. Protected validation/production classification must be explicitly declared by controlled deployment configuration.

## Release identity

Release identity is read only from an allowlist (`APP_RELEASE_SHA`, `RAILWAY_GIT_COMMIT_SHA`, `GITHUB_SHA`), validated against a restricted character set, bounded in length, and returned only as a release identifier. No generic environment inspection is performed.

## Background jobs

PR 9 reports the platform notification delivery subsystem introduced in PR 8 because it is the current platform background-work foundation. A stale processing lease or any dead-letter notification degrades this component. Database unavailability makes the worker state unavailable.

## Scheduled tasks

The dashboard reports whether the platform scheduler has been explicitly declared as configured. It does not claim that a scheduler is healthy merely because application code could support one. Scheduler execution evidence can be expanded in a later focused operational increment.

## Integrations

The platform integration framework is intentionally reported as `NOT_CONFIGURED` until PR 10 implements the approved vendor-neutral integration boundary. PR 9 does not inspect or expose tenant integration configuration as platform-wide health.

## UI

Platform Administration exposes an `Available` System health workspace with manual refresh. The UI reiterates that the view is sanitized and excludes connection strings, credentials, raw environment data, and tenant-regulated content.

## Non-goals

PR 9 does not introduce:

- provider-specific health checks;
- infrastructure-admin controls;
- secret/configuration viewers;
- tenant-regulated content search;
- cross-tenant QMS operational analytics;
- integration configuration or provider adapters;
- mutation/restart/redeploy controls.

# Help Center & Controlled User Manual Architecture

## Purpose

PR 7 adds two related but deliberately distinct knowledge systems to the Trace QMS platform:

1. a searchable operational Help Center that can be revised and republished as product guidance evolves; and
2. a controlled User Manual release model that preserves formal version/effective-date history.

Neither system changes tenant QMS RBAC or regulated tenant record identity.

## Help Center model

Help content is organized through `HelpCategory`, `HelpArticle`, `HelpArticleRevision`, and `HelpArticleEvent`.

Article revisions are append-only. A published article points explicitly to `publishedRevisionId`, so creating a newer draft revision does not silently change what users see. Publication and archive actions use optimistic locking and produce platform audit events.

Ordinary QMS users read only published articles through authenticated `/api/help/...` routes. Platform authors manage content through `/api/platform/help/...` routes and `platform.help.manage`.

## Controlled User Manual model

The formal manual is represented by:

- `UserManual`
- `UserManualSection`
- append-only `UserManualSectionRevision`
- `UserManualRelease`
- `UserManualReleaseSection`
- append-only `UserManualReleaseEvent`

A release snapshots explicit section-revision IDs. Section composition can change only while the release is `DRAFT`. Once published, the release content/configuration is immutable; later corrections or product changes require a new release. A published release can later be archived without rewriting its historical content.

Each release has a version, effective date, applicability metadata, release notes, publication timestamp, and retained archive history.

## Effective-date rule

Publication and effectiveness are separate concepts. Authenticated user-facing APIs do not expose a published manual release before its configured `effectiveAt` timestamp.

## Audit and concurrency

All platform mutations require `platform.help.manage` and create `PlatformAuditEvent` records. Article and manual-release lifecycle changes use optimistic lock versions to prevent stale administrative writes.

Append-only database triggers protect article revisions/events and manual section revisions/release events from update or deletion.

## Application surfaces

- `/help` provides the authenticated Help Center/user-manual experience.
- `/api/help/articles` and article-detail routes expose published help content.
- `/api/help/manuals` and release-detail routes expose published, effective manual releases.
- `/api/platform/help/...` provides platform-authorized authoring and lifecycle actions.
- Platform Administration exposes Help content as a focused foundation workspace.
- Tenant QMS navigation links to Help without granting any platform authoring authority.

## Security boundary

Help authoring permissions never satisfy tenant permissions, and tenant roles never imply `platform.help.manage`. Navigation visibility is not authorization; every platform write continues to authenticate and authorize server-side.

No unrestricted cross-tenant regulated-content search is introduced. Help content and manuals are product documentation, not tenant QMS records.

## Deferred work

Platform notifications/reporting, system health, integration/provider adapters, billing/accounting/CRM integrations, and automated release-notification workflows remain outside PR 7.

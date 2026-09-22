# Help Center Launch Content Coverage

Status: Help Center launch-readiness content slice.

## Purpose

Complete the searchable Help Center content families called for by the launch acceptance criteria while preserving the existing controlled authoring and publishing model.

## Added reviewed baseline content

The reviewed baseline now includes:

### Role-oriented getting started
- General QMS user
- Reviewer / approver
- Quality and laboratory operations
- Tenant administrator

### Frequently asked questions
A reviewed FAQ covering common access, workflow-state, governed-history, and Help-permission questions.

### Troubleshooting
A safe troubleshooting guide for blocked actions, stale record conflicts, missing prerequisites, and escalation to support.

### Terminology & glossary
Plain-language definitions for key concepts including controlled documents, governed records, revisions, effective dates, audit trails, assignments, qualifications, competency, CAPA, and legal/regulatory holds.

### Release notes / what's new
Guidance explaining how release notes relate to tenant permissions, validation, training, local procedures, and controlled user-manual releases.

## Governance

These articles are not auto-published merely because they are present in source control.

The existing `ReviewedHelpBaselineService` remains authoritative:

1. An authorized platform user with `platform.help.manage` assembles the reviewed baseline.
2. Missing articles are created as DRAFT.
3. Changed content creates a new revision only when the reviewed body/change summary differs.
4. A separate authorized publish action publishes the reviewed revision.
5. Platform audit evidence is written for assembly and publication.

This preserves review/publish separation and historical revisions.

## Search and visibility

Published baseline articles are searchable through the existing tenant Help Center. Draft or archived content remains unavailable through the published-only user-facing API.

Help content never grants tenant permissions. Guidance is informational and remains subordinate to tenant RBAC, configured workflow state, training/qualification status, and validation/local procedures.

## Acceptance contribution

This slice fills the remaining Help Center content-family gap for:
- role-based getting-started guides;
- FAQs;
- troubleshooting;
- terminology/glossary;
- administration guidance; and
- release notes / what's new.

The existing workflow how-tos, controlled electronic user manual, historical releases, PDF snapshots, support intake, and contextual deep links remain unchanged.

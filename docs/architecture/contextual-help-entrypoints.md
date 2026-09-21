# Contextual Help Entrypoints

Status: launch-readiness slice
Baseline: `main` at `ed8ff522a7a766bb9044ed67b68ed951b2b684eb`

## Purpose

Make the existing governed Help Center persistently reachable from the tenant QMS and carry the user's current workspace/module into Help so published guidance can be surfaced with less searching.

## Tenant shell entrypoint

The primary tenant sidebar now includes a persistent Help Center link above the compliance/user controls.

The link carries the active top-level view as a bounded `context` query parameter:

- Documents -> `documents`
- Review queue -> `review-queue`
- Administration -> `administration`

This does not create a new Help authorization path. The Help page continues to call the existing authenticated Help APIs.

## QMS module entrypoint

The existing QMS module Help Center link now carries the active module ID:

- documents
- records
- personnel
- training
- quality
- laboratory
- reporting
- administration, where applicable

## Context resolution

The Help Center maps only known context identifiers to predefined search terms.

Unknown context values are ignored.

The contextual search is a convenience only. Users can edit, clear, or broaden the search at any time.

No tenant record content, document identifiers, regulated values, or free-form workspace data are placed into the Help URL.

## Empty contextual result

If the contextual search returns no published article, Help explains that no published guidance matched and directs the user to clear or broaden the search.

## Security and governance boundary

This slice does not:

- expose draft or archived Help content;
- change Help authorization;
- add cross-tenant Help access;
- submit support requests;
- capture regulated record content;
- change user-manual publishing controls;
- generate a PDF manual;
- change Salesforce or Railway activation state.

## Follow-on Help Center work

Remaining launch-readiness work for the broader Help issue includes:

- role-aware contextual recommendations beyond bounded search terms;
- safe end-user support-request submission;
- release-specific controlled PDF/manual snapshot generation and retention;
- additional published operational content for major workflows.

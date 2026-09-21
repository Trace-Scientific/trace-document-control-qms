# Reviewed Operational Help Baseline

Status: launch-readiness content-governance slice for Help Center issue #233.

The baseline supplies reviewed operational guidance for controlled documents, reviews/approvals, records, personnel, training/competency, quality events, equipment operations, reporting, and tenant administration.

## Governance

The source baseline lives in code for review and change control, but deployment does not publish it automatically.

Platform Administration provides two separate `platform.help.manage` actions:

1. **Assemble** — create missing Help categories/articles and append reviewed revisions as DRAFT content.
2. **Publish** — explicitly bind each baseline article to the exact reviewed revision and publish it to authenticated QMS users.

Both actions require a reason and create platform audit evidence. Existing Help revision rows remain append-only. The public tenant Help APIs continue to expose only PUBLISHED articles.

## Boundaries

Help guidance does not override tenant RBAC, signatures, approvals, training requirements, retention policy, or regulated record controls. It contains operating guidance only and no tenant record content.

Publication remains an operator decision after review; merge/deploy alone is not a publication event.

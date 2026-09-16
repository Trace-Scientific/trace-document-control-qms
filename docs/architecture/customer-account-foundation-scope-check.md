# PR 2 Scope Check

This focused change contains only the Customer Account Foundation approved after PR #241.

Included:
- additive control-plane customer account and status-history migration
- one-to-one optional tenant organization linkage
- platform-authorized customer create/read/edit services and APIs
- governed lifecycle transitions with optimistic locking
- append-only lifecycle history and platform audit writes
- regression tests and architecture documentation

Excluded:
- subscription and entitlement behavior
- controlled support access
- sales and commission functionality
- Help Center or User Manual functionality
- provider integrations
- tenant QMS authorization changes
- customer hard-delete API

The branch starts from merged `main` at `956bf951022fb308e81072d62fcbeef5cdb9dcc7`.
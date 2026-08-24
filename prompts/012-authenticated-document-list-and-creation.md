# Prompt 012 — Authenticated document list and creation

## Goal

Replace the remaining demonstration document workflow with tenant-scoped, permission-controlled database operations for authenticated users.

## Delivered behavior

- `GET /api/documents` derives the organization from the authenticated session and requires `document.read`.
- Search across document number, title, and document type, plus lifecycle-status filtering, runs on the server.
- Stable keyset pagination uses descending `createdAt` and `id` order with an opaque cursor.
- Active tenant document types are returned for the creation form.
- The workspace exposes `document.read` and `document.create` capabilities and renders permission-specific states.
- Authenticated document rows come from PostgreSQL; demonstration rows remain only for unauthenticated validation.
- The creation form posts controlled text to the existing command boundary and refreshes the live first page only after a successful save.
- The server computes the SHA-256 content hash rather than trusting a browser-supplied hash.
- Plain-text controlled content is persisted with the version and becomes immutable when the version is effective, superseded, or retired.

## Compliance and security boundaries

- No API query parameter can select an organization.
- Authorization is checked before tenant data access.
- Cursor validation fails closed.
- Content is limited to 1,000,000 characters at both the route and command service boundaries.
- Audit metadata records the computed hash and lifecycle evidence, not the controlled content itself.
- The database integrity test verifies that effective content cannot be modified.

## Deferred

- Rich-text editing, attachments, file uploads, and document-detail rendering.
- Full-text search indexes and organization-wide result counts.
- Draft editing/version comparison and approval actions in the workspace.

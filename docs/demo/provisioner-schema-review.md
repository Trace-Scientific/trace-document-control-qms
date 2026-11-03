# Demo provisioner schema review — design evidence only

Reviewed source: `prisma/schema.prisma` on main, 2026-11-02. This is **not** a live PostgreSQL catalog/privilege inspection.

## Organization
- `id`: UUID primary key, Prisma `uuid()` default (application-generated; verify actual migration behavior).
- `loginCode`: required unique string; `trace-demo-lab` collision must fail.
- `legalName`, `displayName`: required.
- `timezone`: defaults to America/Los_Angeles.
- `active`: defaults to true, so explicitly set **false**.
- `createdAt`: database `now()` default; `updatedAt`: Prisma `@updatedAt` (must inspect generated SQL and migration behavior).

## AuditEvent
- `id`: UUID primary key with Prisma `uuid()` default.
- `organizationId`: required UUID foreign key to Organization (on delete Restrict).
- `actorUserId`: optional; provisioner should not impersonate a real user.
- `action`, `entityType`: required strings.
- `entityId`: optional UUID; set to the created organization ID.
- `metadata`: JSON default `{}`; explicitly include synthetic=true and initialStatus=INACTIVE.
- `occurredAt`: database now() default.
- No signature or approval event is part of this operation.

## Verified from source vs still unverified
Source inspection confirms required fields and the unique login code constraint declaration. It does **not** prove actual live table ownership, role membership, RLS enforcement, triggers, grants, indexes, migrations, or database defaults. Those require separate read-only catalog checks on the demo PostgreSQL instance before SQL or credential changes.

## Guardrail for the next implementation
The existing preparation role gate explicitly rejects any INSERT privilege on Organization or AuditEvent, so it cannot be reused as a write-stage authorization check. A separately reviewed one-time capability must be scoped to exactly one inactive synthetic organization and one audit event. Do not create a broad table writer, weaken the read-only gate, or deploy the currently inert transaction library as a CLI.

No database account, privilege, deployment, or organization record is changed by this review.

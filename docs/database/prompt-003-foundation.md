## Prompt 003 — Database Foundation

### Scope implemented

This phase establishes tenant-scoped identity and authorization, controlled document identity separated from immutable versions, object-storage metadata with SHA-256 evidence, reusable workflows, electronic signatures, exact-version acknowledgments, retention policies, legal holds, and append-only audit evidence.

### Database-enforced safeguards

Composite foreign keys include organizationId for tenant-owned relationships. PostgreSQL triggers prevent audit-event updates/deletes, mutation or deletion of effective document history, and deletion or rewriting of core electronic-signature evidence. Check constraints validate file sizes, SHA-256 formatting, retention periods, and legal-hold release evidence.

### Migration safety

Migration 0002 backfills UserRole.organizationId before making it required. CI starts PostgreSQL 17, deploys the complete migration history, and executes adversarial integrity tests before application checks.

### Regulatory posture

These controls support defensible regulated workflows, but do not independently establish CAP, CLIA, HIPAA, ISO 15189, or 21 CFR Part 11 compliance. Deployment procedures, requirements mapping, security controls, validation evidence, and laboratory governance remain required.

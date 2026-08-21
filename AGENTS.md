# Trace Document Control QMS — Codex Instructions

## Mission
Build a secure, auditable laboratory Quality Management System (QMS) supporting controlled documents, records, personnel, training, competency, quality events, CAPA, risk, equipment, reagents, validation, PT, audits, management review, inspection readiness, electronic signatures, reporting, and future LIMS integration.

## Non-negotiable rules
1. Never weaken authorization to make a test pass.
2. Never allow ordinary CRUD to modify immutable regulated history.
3. Never overwrite a controlled document version; create a new version.
4. Consequential regulated actions must generate audit events.
5. Audit events are append-only and cannot be edited through normal APIs.
6. Electronic signatures are authenticated workflow events, not image files.
7. A signature binds signer, action, record/version, timestamp, meaning, and authentication event.
8. AI is advisory/read-only by default. AI cannot approve, sign, close CAPA, alter records, or modify audit trails.
9. Never claim CAP, CLIA, HIPAA, ISO 15189, or 21 CFR Part 11 compliance merely because a feature exists.
10. Do not copy proprietary accreditation checklist text or competitor content without appropriate rights.
11. Never commit secrets or production PHI/PII.
12. Use database migrations; never rewrite an applied migration.
13. Critical workflows require automated tests.
14. Authorization must be enforced server-side with tenant isolation.
15. Prefer archive/retire workflows over deletion for regulated objects.
16. Regulated exports must be auditable.
17. Do not introduce breaking architectural changes without an ADR.

## Definition of done
Plan -> implement -> test -> review diff -> document.

Every completed change should have appropriate tests, documentation, migration safety, authorization coverage, and a documented risk assessment where regulated behavior is affected.

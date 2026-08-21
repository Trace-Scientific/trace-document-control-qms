# System Architecture

## Status
Prompt 001 — Architecture baseline

## Objective
Create a laboratory QMS platform with strong separation between regulated business domains, security, audit, signatures, workflow, storage, and integration services.

## Target architecture
- Web UI: Next.js/React/TypeScript.
- API/domain services: TypeScript with explicit service boundaries and server-side authorization.
- Database: PostgreSQL for transactional and relational data.
- Object storage: S3-compatible storage for controlled files; database stores metadata, hashes, versions, and relationships.
- Background jobs: durable queue for notifications, document processing, retention jobs, reports, and other asynchronous work.
- Authentication: secure session-based authentication with MFA-ready design.
- Authorization: RBAC plus resource/organization/site scope checks.
- Audit: append-only audit domain, separate from ordinary CRUD.
- Signatures: dedicated electronic-signature service tied to authenticated workflow transitions.
- Observability: structured logs, metrics, health checks, and security events without logging sensitive content unnecessarily.

## Domain modules
1. Identity and access
2. Organization/site/department
3. Document control
4. Record management
5. Personnel
6. Training
7. Competency
8. Quality events/nonconformance
9. RCA/CAPA
10. Risk
11. Equipment
12. Reagents/lots
13. Tests/methods
14. Validation/verification
15. Proficiency testing
16. Internal audits
17. Management review
18. Inspection readiness/accreditation evidence
19. Notifications
20. Reporting/export
21. Integration/API
22. AI assistant

## Domain boundary rule
Business modules own their business data. Cross-cutting concerns such as authorization, audit, signatures, files, notifications, and workflow are consumed through stable services/interfaces rather than direct table manipulation.

## Regulated-state rule
State transitions for controlled objects occur through domain commands. Direct database writes from UI code are prohibited.

## Future deployment
The architecture should work initially as a modular monolith to reduce operational complexity. Domain boundaries must be explicit so individual services can be separated later if scale requires it.

## AI boundary
The AI assistant may retrieve authorized records, summarize, classify, draft, and identify possible gaps. It must not independently change regulated state, approve documents, sign records, close CAPA, or alter audit history.

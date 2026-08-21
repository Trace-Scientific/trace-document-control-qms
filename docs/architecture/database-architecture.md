# Database Architecture

## Database
PostgreSQL is the system of record for transactional QMS metadata and regulated workflow state.

## Tenancy
Every tenant-owned entity carries `organization_id` directly or through a required parent relationship. Repository/service queries must scope by organization. Site and department scope are additional authorization dimensions.

## Core identity
- organizations
- sites
- departments
- users
- roles
- permissions
- user_roles
- role_permissions

## Documents
- document_types
- documents — logical document identity
- document_versions — immutable version snapshots and file references
- document_approvals
- document_acknowledgments
- document_distribution_rules

A document revision creates a new version. Effective historical versions are never overwritten.

## Records
- record_types
- records
- retention_policies
- retention_events
- legal_holds
- disposition_events

## Personnel
- employees
- employee_credentials
- employee_qualifications
- job_descriptions
- employee_job_assignments

## Training and competency
- training_courses
- training_assignments
- training_records
- competency_programs
- competency_elements
- competency_assessments

## Quality
- quality_events
- event_investigations
- root_cause_analyses
- capas
- capa_actions
- capa_effectiveness_checks
- risks
- risk_controls

## Laboratory operations
- equipment
- equipment_events
- reagents
- reagent_lots
- tests
- methods
- validation_projects
- validation_results
- pt_programs
- pt_events

## Audits and accreditation
- audits
- audit_findings
- management_reviews
- accreditation_programs
- requirements
- requirement_evidence

## Cross-cutting
- workflow_definitions
- workflow_instances
- workflow_tasks
- electronic_signatures
- audit_events
- notifications
- files

## Data integrity
Use UUID primary keys, foreign keys, unique constraints, check constraints, timestamps, and indexes for authorization/query paths. Critical state transitions should use transactions and optimistic concurrency/version checks where appropriate.

## Files
Files are stored in object storage. The database stores storage key, content hash, MIME type, size, version, upload actor, timestamps, and retention/legal-hold metadata. Downloads are authorized through the application and audited.

## Audit events
Audit records are append-only. Store actor, tenant, time, action, entity, entity ID, entity version, correlation ID, and cryptographic state hashes where useful. Application roles do not receive UPDATE/DELETE access to audit history.

## PHI/PII posture
Minimize sensitive data. Test fixtures must not use real patient or employee data. Field-level encryption/tokenization should be evaluated for especially sensitive values after the data classification is completed.

# Integration Architecture

## Principle
The QMS is the system of record for quality-system metadata and controlled workflow state. Future LIMS and business systems integrate through versioned APIs/events, not direct shared-database writes.

## Future integration targets
- LIMS
- laboratory instruments/data systems where appropriate
- identity provider
- email/SMS notification provider
- object storage
- e-signature/authentication infrastructure
- reporting/BI
- document scanning/OCR

## API rules
- authenticated
- authorized
- tenant scoped
- idempotent where applicable
- versioned
- audited for regulated operations
- no bypass of workflow/signature controls

## Event candidates
- document became effective
- document superseded
- training assigned
- competency due/expired
- quality event created
- CAPA opened/closed
- equipment calibration due
- reagent lot status changed
- audit finding created/closed

## LIMS boundary
Do not place patient-result processing in the QMS core. The QMS may store controlled test/method metadata and quality evidence and may integrate with a LIMS for approved references/statuses.

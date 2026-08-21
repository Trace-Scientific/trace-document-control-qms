# Workflow Architecture

## Model
Use configurable workflow definitions, instances, tasks, transitions, and assignments.

A workflow transition must validate:
- current state
- actor authorization
- required prerequisites
- segregation-of-duties rules where configured
- required evidence
- required electronic signature

## Document workflow
Draft -> In Review -> Approved -> Effective -> Superseded/Retired

Rules:
- Drafts may be edited by authorized users.
- Review and approval are distinct workflow actions.
- Effective versions are immutable.
- Revision creates a new version.
- Retirement requires an authorized workflow action and audit event.
- Acknowledgment assignments are generated from distribution rules.

## Record workflow
Created -> Active -> Archived -> Eligible for Disposition -> Disposed

Legal hold overrides disposition eligibility.

## Personnel workflow
Employee -> Credential/Qualification Review -> Training Assignment -> Competency -> Qualified/Restricted

Expiration or failed competency may automatically create a review task without silently changing historical records.

## Quality/CAPA workflow
Event -> Triage -> Investigation -> RCA -> CAPA Plan -> Implementation -> Effectiveness Check -> Closed

Closure requires configured evidence and authorization. Closure is audited.

## Signature workflow
A signature request is created as part of a transition. The signer authenticates, reviews the object/version, confirms signature meaning, and signs. The signature is bound to the exact object/version and transition.

## Segregation of duties
The workflow engine should support configurable rules preventing a user from completing incompatible steps when the laboratory's policy requires independent review/approval.

## Notifications
Tasks and reminders are generated asynchronously. Notification delivery failure must not silently change regulated state.

# Prompt 050 — CAPA Actions and Effectiveness Verification

## Slice 4 scope
This slice adds governed corrective and preventive actions linked to quality events after investigation/root-cause/risk assessment.

It adds:
- corrective and preventive action records;
- active same-tenant action ownership and due dates;
- one-way action completion with required completion evidence;
- append-only effectiveness checks with PASS/FAIL result and required evidence;
- authenticated CAPA list/create/complete/verify APIs under existing quality-event permissions;
- transactional audit evidence for CAPA creation, completion, and effectiveness checks.

## Workflow boundaries
- CAPA actions may be created only when the quality event is `ACTION_REQUIRED` or `VERIFICATION`.
- CAPA completion does not change event status automatically.
- effectiveness checks may be recorded only after the CAPA action is completed.
- PASS/FAIL effectiveness results remain evidence and do not silently close, reopen, or otherwise mutate the quality event.

## Integrity boundaries
- CAPA and effectiveness evidence are tenant-bound and event-bound;
- CAPA completion is one-way;
- effectiveness history is append-only;
- owners must be ACTIVE users from the same tenant;
- final event closure remains unavailable outside the later controlled closure/e-signature workflow.

## Migration
`0031_quality_event_capa_effectiveness`

## CAPA worklist

The Quality workspace lists open CAPA actions and completed actions still awaiting a passing effectiveness check across active quality events. Staff can narrow the list to actions they own and filter by work status. The action due date measures completion and is flagged overdue only while the action is open. A failed check remains visible until a passing check is recorded, matching the existing closure gate, which requires at least one pass. The worklist opens the CAPA tab for the associated event and focuses the selected action.

The read endpoint requires organization-wide `quality_event.read` and uses the signed-in organization on each database join. It returns no completion or effectiveness evidence text. Completion, effectiveness records, closure, and their audit controls use the existing governed workflows. The worklist requires no schema or data migration.

## Recorded evidence in the CAPA workspace

Each completed action shows its completion evidence and recorded effectiveness checks. The history includes the result, reviewer name, UTC timestamp, evidence, and whether the reviewer attached a supporting file. Checks are shown newest first. An action shows a passing check on record when any check passed, consistent with the existing closure gate.

The event's CAPA read endpoint returns the existing action list plus the effectiveness history under the same organization-wide quality read permission. History is scoped to the selected event and its actions. This adds no writes or migration.

## CAPA evidence after signed closure

Completion and effectiveness recording lock the associated quality event before locking the CAPA action. Signed closure locks that same event, so a CAPA change either commits before closure or is rejected after it. Closed events show the existing CAPA actions and check history for review. This guard applies to historical records as well and requires no migration.

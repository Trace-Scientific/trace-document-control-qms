# Prompt 051 — Equipment Compliance Holds and Impact Assessment

## Scope
Add automated overdue hard stops, controlled impact assessment, and quality-event integration to Equipment Management.

## Compliance hold model
Active equipment with overdue required calibration or preventive maintenance receives a system-created `EquipmentComplianceHold`. The hold is separate from administrative equipment status so the system does not attribute a scheduler action to a human or silently rewrite regulated status.

An uncleared compliance hold means the equipment is operationally not usable. Holds are deduplicated by tenant, equipment, control kind, and overdue due date.

## Clearance
A hold can be cleared only by an authorized equipment manager and only after the corresponding equipment next-due date has advanced beyond the held due date. A controlled clearance reason and actor are recorded and audited.

The compliance panel displays the held due date, the corresponding current next due date, and whether the date requirement is met. Recording compliance evidence or correcting the schedule refreshes this view. Managers can submit a clearance reason once the date requirement is met. The server checks the current schedule again when accepting clearance. The equipment register continues to evaluate overall usability, including other active holds and open recalls.

When the current date does not support clearance, an equipment manager can open the existing evidence form with the instrument and the corresponding calibration or maintenance type selected. The form links back to the originating hold so the manager can review its current dates. If that hold has since been cleared, the panel leaves the active hold selection blank. These shortcuts use the existing permission checks, evidence requirements, and audit writes. Recording evidence alone leaves the hold open.

## Impact assessment
Impact assessments are append-only and capture disposition, affected scope, rationale, assessor, time, optional linked compliance hold, and optional linked quality event.

`NO_IMPACT` does not create a quality event. `POTENTIAL_IMPACT` and `CONFIRMED_IMPACT` create or reuse a deduplicated system quality event of type `EQUIPMENT_FAILURE` through the existing governed quality-event system-intake service.

## Boundary
Notifications, equipment workspace usability indicators, analytics, service/repair impact workflows, recall/quarantine workflows, and Prompt 051 completeness review remain subsequent slices.

## Reviewing impact assessments

Open an instrument's compliance controls to review its impact assessment history. Entries show the disposition, associated hold, affected scope, rationale, assessor name, and UTC timestamp. The latest entry opens by default. An associated quality event number is shown when the reader also has organization-wide quality event read permission. The read path uses existing tenant-scoped records and does not change assessment or clearance requirements.

# Prompt 051 — Equipment Operational Workspace

## Scope
Make the governed equipment controls operationally visible and usable after the foundation, lifecycle, and compliance/impact slices.

## Controls
- equipment workspace visibility is gated by `equipment.read`;
- service/repair evidence requires `equipment.manage` and is append-only;
- retired equipment cannot receive new service records;
- optional evidence files must be AVAILABLE and same-tenant;
- equipment usability is derived from administrative status, active compliance holds, and required calibration/maintenance due dates;
- new overdue compliance holds notify active users who hold `equipment.manage` through the existing deduplicated NotificationOutbox;
- management analytics report active/out-of-service/retired counts, active holds, 30-day calibration/maintenance due counts, and 90-day failed service records.

## Integrity
The workspace does not directly mutate regulated status or compliance evidence. All writes go through authenticated server-side service boundaries and audited persistence.

## Boundary
Recall/quarantine, broader automated escalation, inventory linkage, and final Prompt 051 completeness review remain subsequent work.

## Equipment register worklist

Staff can search by equipment number or name and combine status with views for active holds, open recalls, unavailable equipment, overdue schedules, upcoming work, and missing required dates. Calibration and maintenance are evaluated independently. The 30-day window includes today and the date 30 calendar days later in UTC. Schedule worklists consider required schedules on active equipment and preserve other records for general browsing. The register shows the server's existing usability decision and adds the count of open recalls from the same tenant-scoped query.

Opening a different instrument clears the prior instrument's service draft and loads history for the selected record. The worklist adds no writes or changes to release, recall, hold, or usability rules.

## Register shortcuts

A register row with an active hold opens the existing compliance controls for that instrument. Authorized equipment managers also see calibration and maintenance shortcuts for required schedules that are overdue, upcoming, or missing a due date. These open the existing evidence form with the instrument and evidence type selected. Each shortcut focuses the destination heading. If the requested instrument is unavailable, the destination has no selected instrument until the user makes a selection. The shortcuts use the existing forms, permissions, validations, and audit writes.

# Prompt 050 — Quality Event Lifecycle Workspace

## Slice 2 scope
This slice adds operational quality-event lifecycle controls on top of the Prompt 050 foundation.

It adds:
- quality-event workspace visibility under `quality_event.read`;
- separately gated mutation controls under `quality_event.manage`;
- reason-required lifecycle actions;
- governed forward progression `OPEN -> INVESTIGATING -> ACTION_REQUIRED -> VERIFICATION`;
- owner and due-date updates with same-tenant ACTIVE-owner validation;
- derived overdue visibility without implicit status mutation;
- append-only `QualityEventChange` history for status, owner, and due-date changes;
- transactional `QUALITY_EVENT_LIFECYCLE_UPDATED` audit evidence;
- row locking during lifecycle mutation to prevent stale concurrent transitions.

## Controlled closure boundary
`CLOSED` remains unavailable in this slice. Closure will be introduced only with the later controlled closure workflow after investigation, root-cause/risk, CAPA/effectiveness, approvals, and electronic-signature requirements are implemented.

## Integrity boundaries
- closed events are immutable;
- no destructive change-history edits are introduced;
- lifecycle mutation requires `quality_event.manage` and a nonblank reason;
- owner changes accept only ACTIVE users from the same tenant;
- overdue state is derived from due date and never silently changes regulated event status.

## Migration
`0029_quality_event_lifecycle`

## Register worklist

The quality event register provides all, active, my active, overdue, and unassigned active views. Search matches event number or summary and can be combined with status and severity. My active events uses the signed-in user's event assignments. Overdue means an active event with a due date before the current UTC date. Event rows open the lifecycle or the Investigation & CAPA workspace directly.

Filters apply to events returned by the existing tenant-scoped read endpoint. The worklist adds no database changes or mutation permissions. Switching events clears pending lifecycle form inputs so they cannot carry over to another record. Investigation, CAPA, and closure continue through their existing server authorization and audit controls.

## Reviewing lifecycle history

The event's lifecycle panel lists recorded status, ownership, and due-date changes with their previous and new values, reason, actor, and UTC timestamp. It includes the signed transition to Closed. Owner names come from tenant user records, including inactive users when those records remain available. The panel refreshes after an update and can be refreshed on demand.

The endpoint requires organization-wide quality event read permission and scopes history to the selected event in the signed-in tenant. It uses the existing append-only change records and requires no changes to stored history or the workflow.

# Prompt 051 — Equipment Recall and Quarantine

## Scope
Add governed equipment recall/quarantine controls after the equipment operations workspace slice.

## Controls
- equipment recalls require `equipment.manage` and capture controlled reason and affected-scope summary;
- only one open recall may exist per tenant/equipment pair;
- opening a recall creates append-only QUARANTINED evidence and immediately makes the equipment operationally not usable;
- closing a recall creates append-only RELEASED evidence and requires a controlled closure reason;
- recall closure is blocked while any equipment compliance hold remains active;
- tenant/equipment/user relationships are enforced by database foreign keys and server-side authorization;
- open/close actions append transactional audit evidence;
- recall history is readable by `equipment.read` users.

## Integrity
Recall/quarantine is an operational control separate from administrative equipment status. The equipment may remain administratively ACTIVE while an open recall makes it NOT USABLE. Quarantine evidence is append-only and cannot be rewritten or deleted.

## Boundary
Broader escalation, inventory/material linkage, automated recall-source integration, and final Prompt 051 completeness review remain subsequent work.

## Recall actions in the workspace

The open-recall count in each equipment register row links to that instrument's recall history. Authorized equipment managers can open a recall with a reason and affected scope, or close an open recall with a closure reason after any active holds have been cleared. The workspace uses the existing recall service and refreshes the register after a write. Closing a recall removes that quarantine restriction. Administrative status, schedule validity, and compliance holds also inform the usability decision.

When active compliance holds block recall closure, the recall panel shows the number of blockers and how many meet the date requirement for clearance. **Review blocking holds** opens that instrument's compliance controls and selects the oldest eligible hold when one exists. Refreshing recall history also reloads the equipment register and its hold counts. Managers clear each hold and close the recall through their existing audited actions.

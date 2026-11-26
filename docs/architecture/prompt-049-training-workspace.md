# Prompt 049 — Training Workspace and Lifecycle Controls

## Slice 2 scope
This slice makes the Training foundation operational while preserving regulated history.

It adds:
- a Training workspace visible only with `training.read`;
- separate `training.manage` controls for course creation, assignment, completion, cancellation, and reassignment;
- derived OVERDUE visibility for ASSIGNED items whose due date has passed;
- controlled cancellation with required reason, actor, and timestamp;
- governed reassignment implemented as cancellation of the prior assignment plus creation of a replacement in one transaction;
- append-only audit evidence for cancellation and reassignment;
- focused lifecycle validation tests.

## Integrity rules
- only ASSIGNED training can be cancelled, reassigned, or completed;
- cancellation never deletes or rewrites the prior assignment;
- reassignment preserves the prior assignment as CANCELLED and creates a new assignment;
- cancellation and reassignment require controlled reasons;
- TrainingRecord completion history remains immutable;
- overdue status is derived for display and does not silently mutate assignment state.

## Deferred Prompt 049 slices
- competency programs and competency elements;
- competency assessment evidence and qualification linkage;
- reminder/escalation automation beyond overdue visibility.

## Six-method CLIA competency template

In Training → Competency → Elements, a training manager can select an active
program, edit the titles and assessment instructions for all six seeded methods,
and review the full configuration before saving. All methods start as required.
The codes and their ordering are fixed. Saving creates six elements and six
attributed audit events in one transaction. Inactive programs, duplicate codes,
and programs with assessment history are rejected as a whole.

The bulk template is limited to programs without assessments because a
qualification rollup reads the latest recorded determination without
recalculating it when requirements change. The existing individual-element
workflow remains available for compatibility, including for assessed programs.
Using that workflow on an assessed program can change the requirements for
future assessments while leaving prior decisions in force. A governed program
versioning change would be needed to address that risk across both workflows.

Element configuration and assessment creation lock the same tenant-scoped
program row. Under Read Committed, the writer that waits for the lock reads the
winner's committed assessments or elements before validating its own write.
These safeguards apply to the application write paths. Templates configure
assessment requirements and carry no regulatory compliance determination.

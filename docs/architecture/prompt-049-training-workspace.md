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

## Competency requirements matrix

In Training → Competency → Requirements matrix, a training manager can require
an active program for an employee, department, or governed job description.
Department and job rules use effective employee job assignments, including
non-primary assignments. The effective interval includes the assignment start
date and excludes its end date, evaluated in UTC. Active employees and programs
appear once per pair, with every applicable rule listed. Matrix access requires
organization-wide training and personnel read permissions. Rule changes require
training management and personnel read permissions.

The matrix displays missing initial assessments and derives recorded
qualification status from the latest assessment and its expiration date. Earlier
assessments remain in history. Department and job rules reflect the current
personnel roster, so updates to that roster can change coverage. Retirement
requires a reason, preserves the rule row, and records an attributed audit event.
Creation and retirement each commit with their audit event. Tenant-scoped foreign
keys protect the target and program relationships, and a partial unique index
allows one active rule per program and target.

The matrix shows configured obligations
and recorded decisions. A current result with no expiration still has no
scheduled renewal, and a requirement created after a historical assessment
does not restart the assessment cycle.

### Instrument and test-system scope

When creating a competency program, a manager can link an active equipment
record and select or create a tenant-specific test system. Both fields are
optional. A linked program can be required for an employee, department, or job
role through the existing matrix. Its scope appears in program selectors and
matrix rows. Instrument selection and labels require organization-wide
equipment read permission.

The links are set at creation. Create a new scoped program for changed
requirements so the earlier program and assessment history keep their original
scope. Existing programs remain usable with empty links. Equipment retirement
leaves historical program links intact. This slice records scope and retains
explicit personnel requirements, with no automatic requirements derived from
equipment state or assignment.

### Initial and recurring assessment deadlines

A manager can set optional initial, first-reassessment, and recurring
intervals when creating a program. The intervals are calendar days, measured in UTC. A direct
requirement starts on its creation date. A department or job requirement starts
on the later of its creation date and the effective job assignment. When
multiple active rules cover a pair, the earliest applicable start drives the
initial deadline.

The matrix shows past-due work separately from recorded qualification. After
an assessment is recorded, the next deadline is the earliest applicable
recorded expiration or the last qualification date plus the configured
interval. A configured first-reassessment interval applies while exactly one
qualification is on record. A second qualification starts the recurring
interval. With no first-reassessment interval, the recurring interval applies
from the first qualification. An unsuccessful reassessment does not restart
the interval or advance the qualification count.
The deadline becomes overdue the day after it is due. Existing programs carry
no new intervals and retain any recorded expiration. These settings do not
create assessment records, send reminders, or change qualification decisions.

### Program evaluator designations

Training managers with personnel management permission can record an evaluator
designation for an active program. The administrator supplies a documented basis
and available written evidence and selects an active employee with an active
linked user. The first designation enables the restriction. A restricted program
requires both the existing training management permission and a current
designation for the recording account. It stays restricted after the last
designation is revoked. Revocations retain history and require a reason.

Designation, revocation, and assessment creation serialize on the same program
row. Assessment audit events retain the applicable designation ID. Current
employee eligibility and the linked account are checked at recording time.
Personnel qualification review and applicable delegation decisions belong to the
laboratory. A designation records the laboratory's decision and is not proof
of CLIA qualification. Existing programs use their existing authorization
workflow until a manager records the first designation.

### Assessment observations

The assessment form shows each configured method and accepts optional
observation notes alongside its result. Notes are recorded with the corresponding
method result in the same assessment transaction. Assessment history loads
recorded results and observations for the selected assessment using the existing
training read permission. Later additions to the program do not appear in an
earlier assessment's results. These records use the existing assessment and
audit events. The observation fields do not add an electronic signature.

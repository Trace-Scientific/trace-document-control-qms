# Prompt 050 — Controlled Final Closure and Electronic Signature

## Slice 5 scope
This slice adds the governed final closure boundary for quality events.

It adds:
- final closure only from `VERIFICATION`;
- required investigation evidence;
- required CAPA presence and completion;
- a passing effectiveness check for every CAPA action;
- explicit closure reason and signature-meaning confirmation;
- password reauthentication with failed-attempt throttling;
- immutable `ElectronicSignature` evidence bound to the quality event;
- append-only `QualityEventClosure` evidence;
- transactional event status/history/audit updates.

## Closure gates
A quality event cannot close unless all of the following are true at commit time:
1. the event remains in `VERIFICATION`;
2. at least one investigation/root-cause/risk record exists;
3. at least one CAPA action exists;
4. no CAPA action remains open;
5. every CAPA action has at least one PASS effectiveness check;
6. the signer has `quality_event.manage`, is ACTIVE, has an enabled credential, confirms the signature meaning, and successfully reauthenticates.

## Signature controls
The closure signature reuses the established electronic-signature control pattern:
- `REAUTHENTICATION` authentication event with purpose `QUALITY_EVENT_CLOSURE`;
- five failed attempts in 15 minutes triggers throttling;
- successful authentication receives a five-minute validity window;
- signature payload is SHA-256 bound to tenant, event, event number, signer, closure reason, and signed timestamp;
- signature meaning is `CLOSED` with controlled meaning text.

## Integrity
Closure evidence, signature evidence, successful authentication, `VERIFICATION -> CLOSED` lifecycle history, and audit evidence are committed in one database transaction. Closed events remain immutable under the existing lifecycle controls.

## Migration
`0032_quality_event_controlled_closure`

## Boundary
Escalation/notifications, cross-event trending, automated quality-event triggers, and operational reporting remain subsequent Prompt 050 slices.

## Closure prerequisites in the workspace

Before signing, the closure panel shows the current lifecycle status, whether investigation evidence exists, and counts for CAPA completion and passing effectiveness checks. The signature form appears for authorized managers after all prerequisites are met. Read access uses the existing organization-wide quality event permission and the signed-in tenant.

The panel gets a read-only snapshot and offers a refresh. The signing transaction rechecks the same evidence conditions after locking the event. Password reauthentication, signature confirmation, and audit writes still apply. No schema change is required.

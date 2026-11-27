# Prompt 050 — Investigation, Root Cause, and Risk Assessment

## Slice 3 scope
This slice adds append-only investigation evidence to governed quality events.

It adds:
- investigation findings and affected-scope assessment;
- optional evidence summary;
- governed root-cause method (`FIVE_WHYS`, `FISHBONE`, `FAULT_TREE`, `OTHER`);
- documented root cause;
- 1–5 likelihood and 1–5 impact scoring with persisted risk score;
- append-only sequence history per quality event;
- authenticated list/create API under existing `quality_event.read` / `quality_event.manage` permissions;
- transactional `QUALITY_EVENT_INVESTIGATION_RECORDED` audit evidence;
- focused authorization and validation tests.

## Workflow boundary
Investigation evidence may be recorded only while an event is `INVESTIGATING`, `ACTION_REQUIRED`, or `VERIFICATION`. Recording evidence does not silently advance event status.

## Integrity boundaries
- investigation records are append-only;
- risk score must equal likelihood × impact and both dimensions are constrained to 1–5;
- event references and investigator identity remain tenant-bound by composite foreign keys;
- event closure remains governed by a later controlled closure/e-signature slice;
- CAPA actions and effectiveness checks are not created implicitly by an investigation record.

## Migration
`0030_quality_event_investigation_risk`

## Reviewing recorded investigations

The investigation workspace shows the newest entry first and lets readers expand earlier entries. Each entry identifies who recorded it and when, and shows the findings, affected scope, root cause, risk inputs, calculated score, evidence summary, and supporting-file indicator. The list remains available for closed events through the existing tenant-scoped quality read permission. Entries are still appended through the governed investigation workflow.

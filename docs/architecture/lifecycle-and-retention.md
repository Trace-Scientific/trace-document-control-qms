# Lifecycle and Retention Architecture

## Controlled documents
Logical document records remain discoverable while versions move through controlled lifecycle states. Historical effective versions are retained and immutable.

## Records
Retention is policy-driven by record type, jurisdiction, organizational policy, and applicable laboratory requirements. The system stores retention policy metadata rather than hard-coding a single retention period.

## Legal hold
A legal hold prevents disposition while active. Hold creation, release, and disposition decisions are audited.

## Disposition
Disposition is a controlled workflow. The system records authorization, timing, method, scope, and evidence. Destruction should be irreversible only after all applicable holds and retention rules are satisfied.

## Archive
Archived records remain discoverable according to authorization and retention rules. Archive is not deletion.

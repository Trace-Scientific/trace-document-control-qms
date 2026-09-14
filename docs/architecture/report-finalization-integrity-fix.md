# Reporting finalization integrity fix

## Issue
Report executions were hashed from the JavaScript object key order returned by the governed query, then stored in PostgreSQL `jsonb`. PostgreSQL can return `jsonb` object keys in a different order. Finalization recomputed the SHA-256 digest with ordinary `JSON.stringify`, so an unchanged report result could fail integrity verification solely because object key order changed during persistence.

## Fix
- hash new report executions from a deterministic JSON representation with recursively sorted object keys;
- verify finalized/exported report results using the same deterministic representation;
- preserve compatibility with existing governed summary executions by accepting the prior `status,count` serialization only during verification;
- when a legacy execution is finalized, store the finalized report with the new deterministic digest;
- continue rejecting any actual value change in report results.

No reporting permissions, source definitions, filters, saved-view ownership, result data, audit semantics, or CSV authorization behavior are relaxed.

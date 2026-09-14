# Reporting finalized execution UI state

## Summary
Reporting & Analytics now distinguishes finalized executions in Execution history.

## Behavior
- If an execution has a corresponding finalized report, the UI displays `Finalized` instead of an actionable `Finalize` control.
- Unfinalized executions continue to expose `Finalize` to authorized managers.
- The existing backend duplicate-finalization protection remains unchanged and authoritative.
- Finalized-report counts, export links, permissions, integrity verification, audit behavior, and persistence are unchanged.

## UAT context
During Reporting & Analytics UAT, duplicate finalization was correctly rejected by the server with `Report execution is already finalized`, but the UI continued to present the invalid action. This change removes that confusing affordance without weakening the server-side governance control.

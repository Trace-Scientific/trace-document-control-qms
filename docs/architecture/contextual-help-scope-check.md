# Contextual Help Scope Check

## Included

- Persistent Help Center entry in the primary tenant shell.
- Current top-level workspace passed as a bounded context value.
- Current QMS module passed as a bounded context value.
- Known-context mapping to predefined Help article search terms.
- Visible contextual indicator in Help.
- Recoverable empty-search state.
- Focused tests for reachability, context mapping, and existing authenticated API usage.

## Explicitly excluded

- No Help authorization changes.
- No support-request capture in this slice.
- No automatic inclusion of record/document content in Help URLs.
- No PDF/manual export in this slice.
- No content publishing workflow changes.
- No Salesforce activation.
- No Railway configuration changes.

## Acceptance guardrail

Contextual Help may use only predefined workspace identifiers and search terms. It must never serialize the active regulated record, document content, credentials, secrets, or arbitrary page state into the Help URL.

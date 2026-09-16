# QuickBooks Provider Evidence

The adapter design was checked against Intuit's current developer materials available during implementation.

- QuickBooks Online uses OAuth 2.0 for API authorization; this PR therefore keeps bearer credentials outside application tables and deliberately excludes consent/refresh-token persistence from the adapter slice.
- Intuit's webhook SDK documentation exposes a webhook verifier token and payload verification operation; this PR implements raw-body HMAC verification against the `intuit-signature` header before normalization.
- Intuit provides distinct QuickBooks Online API sandbox and production endpoints; the adapter selects only between those controlled hosts.

This evidence supports the provider transport boundary only. Internal Trace accounting/commercial state and all tenant QMS authorization remain independently governed.

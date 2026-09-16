# PR 12 Review Notes

Review emphasis:

1. Confirm `quickbooks.accounting` remains a provider transport adapter only.
2. Confirm credentials are deployment-secret values referenced indirectly by the integration connection.
3. Confirm outbound operations are allowlisted and destination hosts are fixed by controlled environment configuration.
4. Confirm `intuit-signature` verification occurs on the exact raw body before any webhook normalization.
5. Confirm realm/company binding and entity/operation allowlists prevent unrelated webhook data from entering normalized events.
6. Confirm no tenant QMS authorization, electronic signature, approval, legal hold, security administration, or regulated-content logic is changed.

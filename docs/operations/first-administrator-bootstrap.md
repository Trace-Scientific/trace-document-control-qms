# First-administrator bootstrap

Use this procedure once, after migrations, only when an organization has no
credentials. It refuses to run after the first credential exists.

Set `BOOTSTRAP_ORGANIZATION_CODE`, `BOOTSTRAP_ADMIN_EMAIL`,
`BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, and a unique
`BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters. Set
`BOOTSTRAP_ADMIN_CONFIRM=CREATE-FIRST-ADMIN`, run `npm run admin:bootstrap`, then
immediately remove every `BOOTSTRAP_ADMIN_*` variable. Never place their values
in source control, logs, tickets, screenshots, or chat.

The command creates the first user, credential, system-administrator role and
current permissions in one transaction, and records an append-only audit event.
Later users and access changes must use the authorized administration workflow;
the bootstrap command must not be used as routine provisioning.

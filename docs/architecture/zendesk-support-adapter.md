# Zendesk Support Adapter

## Purpose

Provide a bounded provider-specific support-system adapter on top of the vendor-neutral Platform Integration Framework.

## Provider choice

The approved platform sequence identified support systems as the next provider category but did not name a required vendor. PR 15 uses Zendesk Support as an implementation choice. This does not establish Zendesk as a permanent or exclusive support provider.

## Adapter boundary

Adapter key: `zendesk.support`.

Outbound authority is limited to `zendesk.ticket.create`. The adapter creates one Zendesk Support ticket through the fixed `https://{subdomain}.zendesk.com/api/v2/tickets.json` endpoint. Callers cannot supply arbitrary provider hosts, paths, methods, ticket IDs, assignees, groups, requester identities, macros, automations, triggers, or administrator operations.

The ticket comment is forced to `public: false` so the first provider slice is an internal support handoff rather than an uncontrolled customer communication path.

## Credentials

The Platform Integration Connection stores only the existing opaque credential reference. Runtime credential resolution supplies a JSON bundle containing the Zendesk subdomain, API user email, API token, and webhook signing secret. Credential values are not persisted in platform integration tables.

## Webhook verification

Zendesk webhooks provide `X-Zendesk-Webhook-Signature` and `X-Zendesk-Webhook-Signature-Timestamp`. The adapter verifies `base64(HMAC-SHA256(timestamp + rawBody))` with constant-time comparison and rejects timestamps outside a five-minute replay window before normalizing the JSON event.

The generic integration framework remains responsible for receipt idempotency, body hashing, normalized-event persistence, and duplicate suppression.

## Governance boundary

Zendesk is a support coordination system only. It cannot grant or revoke Trace support access, authenticate Trace users, assign platform permissions, approve QMS actions, execute electronic signatures, mutate subscriptions or entitlements, release legal holds, or directly modify regulated tenant records.

Trace support-access governance remains authoritative in the internal platform domain.

## Explicit exclusions

- Ticket updates, deletion, merging, bulk import/export, macros, triggers, automations, SLA configuration, views, or organization/user administration.
- Zendesk agent provisioning or role administration.
- Automatic support-access grants based on Zendesk state.
- Automatic tenant-QMS or regulated-record mutation.
- Production credential provisioning.

## Validation boundary

Railway remains synthetic-data development preview only. Zendesk testing must use a sandbox/test account and synthetic support content. Protected validation/production remains on the governed AWS release path.

# Salesforce CDC / Pub/Sub Subscriber Foundation

Status: PR 28 integration hardening
Baseline: `main` at `72afc2ea49842a5b130c8b455f10328a7d236221`

## Purpose

Create the durable state and ownership primitives required for a future Salesforce Change Data Capture subscriber without enabling inbound CRM synchronization in this PR.

Salesforce Pub/Sub API is a gRPC/HTTP2 API. CDC payloads are delivered as Apache Avro binary messages. Subscriber RPCs require Salesforce authentication metadata and use opaque replay IDs to resume stream consumption.

Salesforce retains CDC/platform events for 72 hours. Replay IDs are opaque and are not assumed to be numeric or contiguous.

## Durable subscription state

`PlatformSalesforceCdcSubscription` is scoped to one platform integration connection plus one Salesforce `/data/` topic.

Stored state is deliberately bounded to subscriber operations:

- topic;
- lifecycle status;
- latest replay ID encoded as canonical base64;
- last event/checkpoint/keepalive timestamps;
- bounded failure code;
- worker claim identity/timestamp.

The table does not store Salesforce OAuth tokens, decoded CRM record payloads, Avro schemas, customer content, or tenant-QMS data.

## Lifecycle boundary

New subscriptions are created `DISABLED`.

This PR intentionally exposes no route or service operation that changes a configured subscription to `READY`. As a result, the schema/service foundation cannot initiate a Salesforce Pub/Sub connection by itself.

Future subscriber activation must be a separate reviewed composition/deployment change.

Worker primitives are prepared for that later slice:

- claim only `READY` subscriptions attached to an ACTIVE `salesforce.crm` connection;
- transition a claim to `RUNNING`;
- checkpoint opaque replay IDs after an event or keepalive;
- release cleanly back to `READY`;
- mark failures `DEGRADED`.

All worker mutations require matching claim ownership.

## Replay checkpoint policy

The foundation can persist replay IDs from both event delivery and keepalive responses. This matches Salesforce guidance to retain a recent replay position so reconnects do not unnecessarily seek from an older point in the retained stream.

Replay IDs are treated as opaque bytes and persisted only as canonical base64. They are never parsed as integers or assumed to be sequential.

## Topic boundary

Only bounded Salesforce `/data/` topics are accepted by this foundation. Arbitrary URLs, `/event/` platform-event topics, and caller-controlled network destinations are rejected.

Channel entitlement and exact CDC topic/channel selection remain deployment/configuration decisions for the later activation slice.

## Authentication boundary

No Salesforce credential values are added to this state model.

The existing governed Salesforce OAuth credential reference remains authoritative for provider authentication. A later gRPC subscriber must resolve the OAuth access token through that boundary and provide Salesforce-required RPC metadata such as access token, instance URL, and org/tenant ID without persisting secret values in subscriber state.

## Explicitly deferred

- gRPC client dependency and transport creation;
- Pub/Sub endpoint connection;
- OAuth metadata injection into RPCs;
- GetTopic/GetSchema calls;
- Avro schema retrieval and decoding;
- Subscribe bidirectional stream;
- FetchRequest flow control;
- CDC record normalization;
- normalized-event persistence;
- dead-letter handling for decoded events;
- subscriber scheduler/process ownership;
- UI/API activation controls;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

Salesforce remains an external CRM transport. CDC events cannot perform electronic signatures, approvals, support-access grants, subscription/entitlement decisions, role changes, legal-hold release, or direct tenant-QMS mutation.

Railway remains synthetic-data development preview only.

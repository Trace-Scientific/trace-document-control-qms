# Salesforce Pub/Sub Authentication and Discovery Boundary

Status: PR 29 integration hardening
Baseline: `main` at `95f7c1560901f94a448b1f4f87268936e36ee858`

## Purpose

Add the next Salesforce CDC/Pub/Sub foundation layer without enabling a live subscriber.

This slice defines and tests the provider-authentication metadata, fixed endpoint selection, topic discovery, and schema discovery contracts that a future gRPC transport must satisfy.

## Authentication metadata

Each Pub/Sub RPC requires three Salesforce metadata values:

- `accesstoken`
- `instanceurl`
- `tenantid`

The discovery service reads those values only from the governed Salesforce credential bundle.

The instance URL must remain a bare HTTPS Salesforce origin.

The org ID must be an explicit Salesforce `00D...` identifier. The service does not infer an org ID from the instance host, topic, tenant GUID, user identity, or any other field.

The existing Salesforce OAuth refresh implementation preserves unrecognized credential-bundle fields when rotating tokens, so a governed `tenantId` field survives refresh. This PR does not add a browser authorization flow or an org-ID discovery call.

## Endpoint boundary

This PR allows only the reviewed global Salesforce Pub/Sub endpoint:

`api.pubsub.salesforce.com:443`

No caller-provided host, port, IP address, URL, or alternate endpoint is accepted.

Region-specific endpoint support is deferred until that hostname and deployment requirement are separately reviewed.

## Topic discovery

The service accepts only governed Salesforce `/data/` topics already permitted by the CDC subscription foundation.

The transport contract exposes only:

- `GetTopic`
- `GetSchema`

`GetTopic` must return the requested topic name, a non-empty tenant GUID, a subscribable flag, and a schema ID.

The service fails closed if:

- Salesforce returns a different topic;
- the topic is not subscribable;
- the schema ID is missing.

## Schema discovery

The schema ID returned by `GetTopic` is passed to `GetSchema`.

The service fails closed if Salesforce returns a different schema ID.

The returned schema must be valid bounded JSON with an Avro record shape containing a record name and fields array. Full Avro decoding is intentionally not implemented in this slice.

The service computes a SHA-256 digest of the exact schema JSON for future cache/change-detection work, but this PR does not persist schemas.

## Transport boundary

`SalesforcePubSubDiscoveryTransport` is an injected interface rather than a runtime-composed network client.

This is intentional. The repository does not yet add a gRPC dependency, protobuf loader, TLS channel, or live Pub/Sub connection.

A later PR must implement the transport from the reviewed Salesforce proto definition, supply TLS, attach the required metadata to every RPC, and pass dedicated network/error tests before runtime composition.

## Explicitly deferred

- gRPC client implementation;
- protobuf loading/code generation;
- live `GetTopic` or `GetSchema` network calls;
- Subscribe/ManagedSubscribe;
- FetchRequest flow control;
- replay activation;
- Avro binary decoding;
- CDC normalized-event persistence;
- subscriber scheduler/service;
- Railway service creation;
- protected AWS deployment.

## Governance boundary

Discovery cannot perform tenant-QMS mutations, account changes, support-access grants, approvals, signatures, subscription decisions, or Salesforce writes.

The discovery service is not registered in `integration-runtime.ts`, so merging this PR cannot initiate Salesforce network traffic.

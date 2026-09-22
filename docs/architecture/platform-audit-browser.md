# Platform Audit Browser

Status: platform-administration launch-readiness slice.

## Purpose

Provide authorized Trace platform personnel with a read-only browser over the existing append-only `PlatformAuditEvent` control-plane history.

## Authorization

The audit API and UI require `platform.audit.read`. There are no mutation endpoints or UI controls for audit rows.

The existing database trigger remains authoritative and rejects UPDATE or DELETE operations against `PlatformAuditEvent`.

## Read model

The browser exposes:
- event time;
- action;
- entity type, entity UUID, and optional version;
- platform actor identity and email when attributable;
- actor membership UUID;
- reason;
- correlation/request identifiers; and
- structured platform audit metadata.

Actor email is resolved only through `PlatformIdentity -> User` for attribution.

## Filters

The read service supports:
- action substring;
- exact entity type;
- actor platform identity UUID;
- from/to timestamps; and
- descending cursor pagination using occurredAt + event UUID.

Each page is capped at 200 records; the UI requests 100 at a time. Responses use `Cache-Control: no-store`.

## Tenant-data boundary

The audit browser does not join tenant `Organization`, document, training, quality, laboratory, or other regulated QMS record tables. It is a control-plane audit browser, not an unrestricted cross-tenant regulated-data report.

Audit metadata is displayed as stored. Future metadata-writing services should continue to avoid secrets and regulated tenant content unless specifically governed.

## Integrity

Audit storage remains append-only at the database boundary. This browser adds visibility only and does not alter hash/correlation fields, audit history, or tenant audit behavior.

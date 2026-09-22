# Sales Ownership Administration Workspace

Status: commercial administration usability slice.

## Purpose

Replace the placeholder Sales cards in Platform Administration with an operational workspace for Trace-side sales representative profiles and effective-dated customer ownership.

## Read model

The workspace requires `platform.sales.read` and returns only:
- configured sales representatives;
- effective-dated sales assignments; and
- minimal active platform identity fields needed to create a representative.

It does not expose tenant QMS records.

## Governed actions

Users with `platform.sales.manage` may:
- create a sales representative linked to an ACTIVE platform identity; and
- assign a non-terminated customer account to an active sales representative for an effective date window.

Existing service controls reject overlapping sales assignments for the same customer, preserving reproducible historical attribution.

Every create action requires a reason and writes platform audit evidence.

## Security boundary

Sales ownership is commercial control-plane metadata only. It does not grant tenant membership, tenant roles, document access, support access, signatures, approvals, or regulated QMS privileges.

Platform sales permissions remain distinct from commission permissions and from tenant authorization.

## Follow-on

Commission-plan configuration, accrual lifecycle, adjustments, approvals, payments, and reporting remain in the dedicated Commissions workspace and can now build on the operational sales-assignment layer.

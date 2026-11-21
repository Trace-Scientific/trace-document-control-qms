# Trace QMS synthetic demo role setup

Status: proposed configuration, **not applied to Railway or any tenant**. All people are fictional. Use only in the isolated demo tenant `trace-demo-lab`. Do not run against production.

## Role assignments

| Fictional user | Role | Scope |
| --- | --- | --- |
| Alex Morgan | System Administrator (existing) | ORGANIZATION |
| Sarah Mitchell | Quality Manager (created; assignment unverified) | ORGANIZATION |
| Daniel Brooks | Document Reviewer (to create) | ORGANIZATION |
| Emily Carter | Document Approver (to create) | ORGANIZATION |
| Michael Chen | Laboratory Technician (to create) | ORGANIZATION |

## Proposed least-privilege permission sets

- Quality Manager: `document.read`, `document.create`, `document.revise`, `document.submit`, `document.review`, `document.review.complete`, `document.review.manage`, `document.approve`, `document.make_effective`, `document.distribute`, `document.export`, `audit.read`. **Existing role's permissions must be verified before modifying**.
- Document Reviewer: `document.read`, `document.review`, `document.review.complete`.
- Document Approver: `document.read`, `document.approve`.
- Laboratory Technician: `document.read`, `document.acknowledge`.

All sets exclude `administration.manage` and `document.delete`. These are proposed demo defaults, not a regulatory approval or an assertion that workflows are already operational.

## Safe completion sequence

1. Confirm the Quality Manager role appears once and inspect its actual effective permissions.
2. Assign Sarah Mitchell Quality Manager at ORGANIZATION scope; verify effective access.
3. Create each remaining role using the precise keys above; confirm no duplicate before retrying failed submissions.
4. Assign Daniel, Emily and Michael to their respective roles at ORGANIZATION scope.
5. Verify role assignments in the Administration UI and verify access using authorized test sessions, without sharing passwords.
6. Set up synthetic sites, departments, document types and review/approval/acknowledgment demonstration documents. Use no patient data.

## Safety gates

- Never run a direct tenant write or role seed against the production database.
- Do not store demo passwords or session cookies in source control.
- Role creation and assignment must be performed via authenticated, audited application operations or an independently approved demo-only migration; this manifest does **not** perform writes.
- Confirm permission keys against the deployed tenant permission catalog before creating roles.

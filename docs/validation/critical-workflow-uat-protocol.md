# Critical workflow UAT protocol

## Purpose and controls

Execute this protocol only in the approved validation environment with synthetic
records. Record the deployed SHA, tester identity, role, timestamps, inputs,
expected result, actual result, evidence reference, and pass/fail decision for
every case. A tester must not approve their own authored document where the test
is intended to demonstrate segregation of duties.

## Preconditions

- Candidate SHA is deployed from the non-root container artifact.
- Database migrations, liveness, readiness, and automated qualification passed.
- Test organization, active users, roles, and synthetic document type exist.
- Browser developer tools and screenshots must not expose session tokens,
  passwords, connection strings, or unrelated tenant/personal data.

## Test cases

| ID | Actor | Procedure | Expected result |
| --- | --- | --- | --- |
| UAT-01 | Author | Create and save a controlled draft | Version `0.1` stores content, hash, author, and audit event |
| UAT-02 | Author | Edit the current draft using its lock version | Content/hash and lock version change; prior audit evidence remains |
| UAT-03 | Submitter | Configure two unique reviewers with distinct future deadlines and submit | Document enters review; only stage 1 is active |
| UAT-04 | Wrong reviewer | Attempt to decide the active stage | Generic denial; task and document remain unchanged |
| UAT-05 | Reviewer 1 | Accept stage 1 with a required comment | Stage 1 completes and stage 2 becomes active |
| UAT-06 | Reviewer 2 | Request changes with a required comment | Workflow closes and revision returns to draft |
| UAT-07 | Author | Create a corrected successor submission and complete both stages | Approval task becomes available only after all reviews |
| UAT-08 | Approver | Approve with invalid then valid reauthentication | Invalid attempt fails generically; valid signature binds exact content/version |
| UAT-09 | Effective manager | Make the approved revision effective | Revision becomes current; prior current revision is superseded |
| UAT-10 | Administrator | Create a workflow-template version and activate it | Prior version is preserved; one version for the key is active |
| UAT-11 | Reviewer/manager | Delegate an active stage and reassign another with reasons | Only eligible tenant users are accepted; notifications and audit events exist |
| UAT-12 | Acknowledgment recipient | Complete an assigned acknowledgment with reauthentication | Completion and signature bind the exact effective version |
| UAT-13 | Administrator | Run overdue and notification recovery controls twice | Notifications are idempotent; recovery action is auditable |
| UAT-14 | Cross-tenant user | Attempt document, task, and notification access by known identifiers | No tenant data is returned or changed |
| UAT-15 | Auditor | Review lifecycle, workflow, signature, acknowledgment, and transfer history | Chronology and attribution are complete and immutable |

## Acceptance

All critical cases pass, or deviations have documented impact, corrective action,
retest evidence, and quality approval. Attach the completed protocol to the
controlled release record; do not commit executed evidence containing identities
or environment details to the source repository.

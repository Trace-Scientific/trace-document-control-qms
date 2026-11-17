# Trace QMS — 15-minute prospective laboratory customer walkthrough

**Audience:** Laboratory quality managers, technical supervisors, laboratory directors, and operations leaders.  
**Scope:** Existing synthetic demo workspace only. No patient data, production tenant access, or invented audit/signature records.  
**Status:** Operator guide; external sharing requires the approvals in [customer-demo-readiness-gate.md](customer-demo-readiness-gate.md).

## Before the meeting (operator checklist)

- Confirm the exact demo URL, Railway environment, and synthetic organization. Do not use the production tenant.
- Confirm access to the existing fictional Alex Morgan (administrator/owner), Daniel Brooks (technical reviewer), and Emily Carter (final approver) accounts, with individually issued credentials. Never share passwords on screen.
- Verify document TEST-001 v0.1 is EFFECTIVE with both assignments COMPLETED; FRM-002 v0.1 SUPERSEDED and v0.2 EFFECTIVE, if still present.
- Confirm no real patient/customer information is present in the demonstration workspace. Do not assume this is satisfied merely because the repository manifest is synthetic.
- Confirm the final approver does not see technical-review decision buttons in the deployed demo build. If not verified, omit that screen and record a blocker.
- Use existing evidence and read-only views. Do not create another document or trigger signatures just to fill the walkthrough.

## Minute-by-minute presentation

| Time | Screen or action | Message to prospective customer | Evidence / limit |
| --- | --- | --- | --- |
| 0:00–1:30 | Sign in to the existing demo workspace; show organization navigation | Trace QMS separates controlled-document work from platform administration | Demo workspace access only; tenant isolation requires independent security evidence |
| 1:30–3:00 | Open document library; find TEST-001 | Documents are identifiable by number, title, revision and lifecycle status | TEST-001 v0.1 observed EFFECTIVE on Nov 16, 2026 |
| 3:00–5:00 | Open TEST-001 detail; inspect technical and final approval stages | Technical review and final electronic approval are distinct governed steps | Daniel Brooks and Emily Carter assignments observed COMPLETED |
| 5:00–6:30 | Explain the draft-to-submission path using the existing interface; do not submit | Creating a draft leads to the controlled submission flow, with reviewer and final approver selection | Exact-version handoff improved in PR #446; demo deployment of this change not independently verified |
| 6:30–8:30 | Display reviewer/approver assignments and comments already recorded | Ordered review provides visibility into who acts next | Demo workflow observed; do not imply every permission or audit-integrity test is complete |
| 8:30–10:30 | Open FRM-002 version history | Publishing a successor revision supersedes the previous effective version | v0.1 SUPERSEDED and v0.2 EFFECTIVE observed |
| 10:30–12:00 | Show the effective-document detail and successor-revision action | Controlled revisions can be prepared without rewriting the previous record | Create successor revision was visible on TEST-001 |
| 12:00–13:30 | Review document categories and available navigation | SOPs, policies, work instructions, and forms are planned demo categories | Repository manifest includes 30 entries; do not claim all are deployed |
| 13:30–15:00 | Questions and next steps | Discuss onboarding, subscriptions, access roles, and pilot requirements | Do not promise unverified modules or regulatory certification |

## Questions to ask the prospect

1. How many laboratories, sites, and users would need access?
2. Which controlled document categories and approval roles are essential?
3. Do you require multiple technical-review stages or separate final approval?
4. Which existing document templates and revision histories would need migration?
5. What training, audit, reporting, or integration requirements should be evaluated during a pilot?

## Handling unavailable or unverified screens

- If a document is absent, say it is not present in the current demo; do not create fictitious status evidence.
- If the demo build does not contain the latest UI change, skip that live step and describe it as pending verification.
- If the workspace contains any non-synthetic information, stop the demonstration and escalate before sharing access.
- Do not demonstrate tenant provisioning, restore, privileged configuration, or real e-signature credentials during a sales meeting.

## After the meeting

Record the prospect's requested capabilities, any gaps, follow-up owner, and whether a separately approved demo-access invitation is needed. Preserve customer questions without entering patient information into the demo.

**Release boundary:** This walkthrough is not product validation, customer access approval, or a substitute for security testing. The customer-demo readiness gate remains authoritative.

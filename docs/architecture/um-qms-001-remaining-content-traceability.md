# UM-QMS-001 Remaining Content Authoring — Source Traceability

Baseline reviewed: `3e4cac507ed8a8f3ff7594893dca8723d344d895`

This slice completes the remaining controlled-manual section drafts from implemented QMS behavior.

| Manual section | Primary implementation evidence |
| --- | --- |
| UM-07 Personnel, credentials, and qualifications | `personnel-management-workspace.tsx`; `personnel-credential-workspace.tsx`; `personnel-qualification-workspace.tsx` |
| UM-08 Training and competency | `training-management-workspace.tsx`; `competency-management-workspace.tsx` |
| UM-09 Quality events | `quality-event-workspace.tsx`; `quality-event-governed-actions.tsx`; quality evidence workflow |
| UM-10 Laboratory operations | `equipment-management-workspace.tsx`; governed equipment evidence workflow |
| UM-11 Reporting and analytics | `reporting-workspace.tsx` |
| UM-12 Administration and configuration | `access-administration.tsx`; membership administration; workflow-template administration |
| UM-13 Notifications | notification drawer behavior; `notification-delivery-administration.tsx`; support status notifications |
| UM-15 Evidence handling, integrity, and prohibited content | `governed-evidence-file-picker.tsx`; evidence upload/scanning controls |
| UM-A Glossary and status definitions | terminology used across the verified launch implementation |

## Authoring rules

- Describe only implemented behavior.
- Preserve the difference between product controls and customer SOP obligations.
- Treat visibility of a control as permission-dependent, not as a guarantee that every user can perform the action.
- Preserve append-only/historical evidence concepts where the product does so.
- Do not imply that operational indicators, notifications, assignments, or uploaded files complete the underlying governed action.
- Keep controlled support access separate from customer Help intake.
- Keep draft manual source separate from published/effective `UserManualRelease` content.

## Completion state

With this slice plus PR #299, all sixteen launch-baseline sections have source-controlled draft bodies.

The next step after merge is not publication. The next step is a completeness and consistency review across all sixteen drafts, followed by controlled creation of section revisions and assembly of the first **DRAFT** `UM-QMS-001` release. Publication/effectiveness remains a separate governed decision.

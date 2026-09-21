# UM-QMS-001 Core Content Authoring — Source Traceability

Baseline reviewed: `8ebd8c43bb43ce360e1f9919a5d41a06e4332b81`

This slice authors the first seven controlled-manual section drafts from implemented QMS behavior. The text is deliberately limited to behavior visible in the reviewed source and existing governed architecture.

| Manual section | Primary implementation evidence |
| --- | --- |
| UM-01 Document control and manual governance | Controlled manual release/read architecture; Help Center effective-release behavior; PR #298 launch baseline |
| UM-02 Access, authentication, and user responsibilities | Permission-gated workspaces; document approval authentication confirmation; safe Help support intake |
| UM-03 Navigation and contextual Help | `qms-module-shell.tsx`; `help-center.tsx` |
| UM-04 Document operations and controlled files | `documents-content-tabs.tsx`; document dashboard approval/content behavior |
| UM-05 Review queues and approval assignments | `review-queue-workspace.tsx` |
| UM-06 Records management | `record-management-workspace.tsx` |
| UM-14 Help, customer support, and controlled support access | `help-center.tsx`; merged support-intake and controlled-case separation |

## Authoring rules

- Describe the released product behavior, not aspirational functionality.
- Do not invent customer SOP requirements.
- Do not state that a user has a permission merely because the product supports it.
- Do not treat uploaded files, draft manual revisions, or support intake as controlled/effective/privileged merely by creation.
- Preserve the tenant/platform support-access boundary.
- Do not include secrets, credentials, PHI, regulated customer records, or synthetic customer records in repository manual text.

## Release state

These are source-controlled **draft section bodies** only. They are not a published `UserManualRelease`, are not effective instructions in the Help Center, and do not change tenant data.

The next content slices should author UM-07 through UM-13 and UM-15/UM-A from the corresponding verified workspaces. Only after the complete manual is reviewed should the governed database revisions and first draft release be assembled.

# Contextual Help Deep Links

Status: Help Center launch-readiness slice.

## Purpose

Complete the major-workflow contextual Help path by binding each supported QMS workspace to its reviewed launch article rather than relying only on a search term.

## Context-to-article map

The following contexts resolve to reviewed baseline articles:

- Documents → `controlled-documents`
- Review queue → `review-queue-approvals`
- Administration → `tenant-administration`
- Records → `records-management`
- Personnel → `personnel-credentials-qualifications`
- Training & competency → `training-competency`
- Quality → `quality-events`
- Laboratory operations → `equipment-operations`
- Reporting & analytics → `governed-reporting`

The QMS module shell continues to pass only a bounded context identifier. No record ID, document content, patient information, or other regulated record data is placed in the Help URL.

## Role-aware recommendations

Recommendation cards remain permission-aware. They now open the associated reviewed article directly instead of using only the article-search query.

Help recommendations do not grant QMS access; they are derived from permissions already present in the authenticated tenant authorization context.

## Published-only boundary

Direct article retrieval still uses `HelpContentService.getPublishedArticle`, which returns only articles whose status is `PUBLISHED`.

A context mapping or direct `article` query parameter therefore cannot expose draft or archived Help content.

## Search fallback

The existing contextual query remains populated and article search still runs. This preserves a broader set of related published results after the user backs out of the directly opened article.

## Acceptance contribution

This closes the contextual-how-to portion of the Help Center issue for the major launch workspaces while preserving the existing controlled authoring/publishing workflow, release-versioned manual, PDF snapshots, and safe support-request intake.

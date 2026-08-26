# Prompt 032 — Railway preview migration image

## Objective

Apply committed Prisma migrations before each Railway preview start without
changing the protected AWS release and migration separation.

## Delivered scope

- Add a dedicated non-root Railway preview Dockerfile.
- Include the pinned Prisma CLI and apply forward-only committed migrations
  before starting Next.js.
- Fail startup and readiness when migration deployment fails.
- Build the preview image in CI and extend the Railway configuration contract.
- Document the exact Railway Dockerfile selection.

## Deployment boundary

This change does not run migrations or create hosting resources. The Railway
preview remains synthetic-data-only and unvalidated.

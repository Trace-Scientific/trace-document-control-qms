# Prompt 030 — Runtime preview boundary

## Objective

Ensure the Railway development-preview warning is rendered from runtime
configuration when the application is built through its Dockerfile.

## Delivered scope

- Read `DEPLOYMENT_TIER` in the server-rendered page and pass only a boolean
  preview classification to the client dashboard.
- Remove reliance on a build-time `NEXT_PUBLIC_*` value.
- Extend the preview contract test to prevent regression to a browser-exposed
  environment boundary.
- Update the setup runbook to require only the server-side runtime variable.

## Deployment boundary

This fix does not create Railway resources or charges. Existing preview data
remains synthetic-only, and the environment remains unvalidated.

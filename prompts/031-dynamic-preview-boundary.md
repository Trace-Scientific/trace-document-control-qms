# Prompt 031 — Dynamic preview boundary

## Objective

Prevent Next.js static prerendering from freezing the Railway preview
classification during the Docker build.

## Delivered scope

- Force the landing page to render dynamically so `DEPLOYMENT_TIER` is read
  from the running Railway service on each request.
- Extend the Railway preview contract test to require dynamic rendering.

## Deployment boundary

This source fix creates no resources or charges. The Railway environment
remains synthetic-data-only and unvalidated.

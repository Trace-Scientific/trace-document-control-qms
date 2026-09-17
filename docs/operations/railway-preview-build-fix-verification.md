# Railway Preview Build Fix Verification

Use this checklist after PR 25 checks pass and the branch is merged:

1. Confirm `main` points to the squash merge SHA and the commit signature is verified.
2. Confirm Railway deploys the merged `main` using `/Dockerfile.preview`.
3. Confirm `next build` completes TypeScript checking successfully.
4. Confirm the application starts and `/api/health/readiness` returns HTTP 200.
5. Confirm `PLATFORM_SCHEDULER_CONFIGURED` remains unset or false until the Twilio scheduler one-time execution is proven successful.
6. Treat all Railway evidence as development-preview evidence only.

# Railway preview build troubleshooting

Status: development-preview operational note

If the Railway preview fails during `next build` TypeScript checking, preserve strict type checking and correct the source/configuration error rather than bypassing it with `ignoreBuildErrors` or a relaxed compiler mode.

The September 2026 preview failure after PR #264 was traced to:

- ES2017 target conflicting with existing BigInt literals;
- Vitest global test functions not declared to TypeScript during the production build;
- an untyped Prisma raw query returning `unknown`;
- a manual-release JSON input type mismatch.

Railway remains synthetic-data-only and is not formal validation evidence.

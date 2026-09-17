# PR 25 Acceptance

PR 25 is acceptable when repository CI passes on the exact PR head SHA and the resulting merged `main` can complete the Railway preview production build without TypeScript errors.

No scheduler activation is part of this PR. Scheduler activation resumes only after the preview web application is healthy on merged `main`.

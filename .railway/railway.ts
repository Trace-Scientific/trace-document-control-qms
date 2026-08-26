import {
  defineRailway,
  github,
  postgres,
  project,
  service,
} from "railway/iac";

export default defineRailway(() => {
  const database = postgres("preview-postgres");

  const application = service("qms-preview", {
    source: github("Trace-Scientific/trace-document-control-qms", {
      branch: "main",
    }),
    build: "npm ci && npm run db:generate && npm run build",
    start: "npm run preview:start",
    healthcheck: "/api/health/readiness",
    healthcheckTimeout: 60,
    replicas: 1,
    env: {
      DATABASE_URL: database.env.DATABASE_URL,
      DEPLOYMENT_TIER: "development-preview",
      NEXT_PUBLIC_DEPLOYMENT_TIER: "development-preview",
    },
  });

  return project("trace-qms-preview", {
    resources: [database, application],
  });
});

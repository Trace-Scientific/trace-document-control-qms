FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ARG APP_RELEASE_VERSION=0.1.0-rc.2
ARG APP_RELEASE_SHA=unknown
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP_RELEASE_VERSION=$APP_RELEASE_VERSION
ENV APP_RELEASE_SHA=$APP_RELEASE_SHA
LABEL org.opencontainers.image.version=$APP_RELEASE_VERSION
LABEL org.opencontainers.image.revision=$APP_RELEASE_SHA
RUN addgroup --system --gid 1001 qms && adduser --system --uid 1001 --ingroup qms qms
COPY --from=builder --chown=qms:qms /app/.next/standalone ./
COPY --from=builder --chown=qms:qms /app/.next/static ./.next/static
COPY --from=builder --chown=qms:qms /app/prisma ./prisma
USER qms
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/readiness').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

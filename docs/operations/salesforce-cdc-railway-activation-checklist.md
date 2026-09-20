# Salesforce CDC Railway Activation Checklist

Use this checklist only during a separately approved preview activation.

## Repository and deployment

- [ ] `main` SHA recorded.
- [ ] Security checks passed on that exact SHA.
- [ ] Application deployment healthy.
- [ ] Database migrations successfully applied.
- [ ] Synthetic/non-regulated validation data only.

## Worker service configuration

- [ ] Service name is `salesforce-cdc-worker`.
- [ ] Source repository is `Trace-Scientific/trace-document-control-qms`.
- [ ] Branch is `main`.
- [ ] Dockerfile path is `/Dockerfile.preview`.
- [ ] Start command is `npm run salesforce:cdc:worker`.
- [ ] Replicas = 1.
- [ ] Restart policy = never.
- [ ] No public domain attached to the worker.

## Variables

- [ ] `APP_BASE_URL` is reviewed HTTPS application URL.
- [ ] `CRON_SECRET` is identical on application and worker and >=32 characters.
- [ ] `SALESFORCE_CDC_WORKER_MAX_RUN_MS` is absent or 1000–300000.
- [ ] Governed Salesforce credential reference resolves successfully.
- [ ] No raw Salesforce token is stored directly unless explicitly approved by credential governance.

## Fail-closed verification before enabling

- [ ] Route returns 401 without bearer authorization.
- [ ] Route returns 503 when worker enable flag is absent/false.
- [ ] Worker command exits non-zero when enable flag is absent/false.
- [ ] No duplicate worker service or schedule exists.

## Manual activation

- [ ] Set `SALESFORCE_CDC_WORKER_ENABLED=true` on application.
- [ ] Set `SALESFORCE_CDC_WORKER_ENABLED=true` on worker.
- [ ] Run exactly one manual invocation.
- [ ] Capture deployment/run evidence.
- [ ] Confirm bounded exit.
- [ ] Confirm no QMS mutation.

## Schedule activation

- [ ] Manual run accepted.
- [ ] Reviewed cron cadence documented.
- [ ] Cadence exceeds maximum run duration plus safety margin.
- [ ] Schedule added only after manual acceptance.

## Rollback

- [ ] Disable/remove worker enable flag.
- [ ] Disable/remove schedule.
- [ ] Confirm no active worker execution remains.
- [ ] Preserve receipt/normalized-event evidence.
- [ ] Record last replay checkpoint and DEGRADED state, if any.

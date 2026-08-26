# AWS validation service preflight

Do not deploy `service.yaml` until every item is approved and recorded.

- [ ] Foundation stack outputs were captured from `us-west-1`.
- [ ] AWS account and deployment identity are approved.
- [ ] Cost estimate includes two Fargate tasks, two NAT gateways, Multi-AZ RDS,
      load balancing, logs, monitoring, KMS, DNS, and data transfer.
- [ ] `traceqms.com` Route 53 hosted-zone control is verified.
- [ ] ACM certificate for `traceqms.com` is issued in `us-west-1`.
- [ ] Immutable application image digest and full source SHA match the approved
      release record.
- [ ] Least-privilege `DATABASE_URL` and 32-or-more-character `CRON_SECRET` are
      stored in Secrets Manager under the foundation KMS key.
- [ ] Alert email owner is named and will confirm the SNS subscription.
- [ ] Database migration execution method is approved and tested from the
      private application network before service traffic is enabled.
- [ ] Dedicated migration image digest and task-definition revision match the
      same source SHA as the application image.
- [ ] Migration task ran once in a private application subnet, exited with code
      zero, and its redacted CloudWatch log reference is attached as evidence.
- [ ] Rollback artifact and database recovery point are recorded.
- [ ] `QMS_BASE_URL=https://traceqms.com` is configured as a GitHub variable.
- [ ] GitHub `CRON_SECRET` matches the runtime secret without exposing its value.
- [ ] `MONITOR_ENABLED` remains `false` until the deployed endpoint passes manual
      qualification; it is changed to `true` only after owner approval.

The service stack creates DNS for the apex hostname. CloudFormation load-balancer
deletion protection must be disabled through an approved change before the stack
can be removed. No stack command should use `--disable-rollback`.

## Migration execution control

Build the application image normally and build the migration image with
`docker build --target migration`. Push both under immutable references and
record both digests. Render `migration-task-definition.json` without shell
`eval`, reject unresolved `${NAME}` tokens, register the task, and run it once
in an application subnet with the application security group and no public IP.

Wait for the ECS task to stop, then require the `migration` container exit code
to equal zero before updating or starting the application service. A timeout,
missing exit code, nonzero exit code, secret retrieval error, or migration error
blocks deployment. Never use `prisma migrate reset`, edit an applied migration,
or run an ad hoc down migration.

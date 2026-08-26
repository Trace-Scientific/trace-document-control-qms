# AWS validation foundation preflight

Do not apply the foundation change set until every item is approved and recorded.

- [ ] Target account and `us-west-1` region are independently verified.
- [ ] `validation-foundation` has required reviewers and prevents self-approval
      where GitHub plan capabilities allow it.
- [ ] GitHub OIDC trust is restricted to this repository and protected
      environment; no long-lived AWS credentials are configured.
- [ ] `AWS_VALIDATION_FOUNDATION_ROLE_ARN` is least privilege and scoped to the
      foundation stack and named validation resources.
- [ ] `AWS_VALIDATION_ACCOUNT_ID` is the approved 12-digit account and differs
      from production where environment segregation requires it.
- [ ] AWS cost review includes Multi-AZ PostgreSQL, two NAT gateways, load/data
      processing, KMS, ECR, CloudWatch logs, backups, snapshots, and transfer.
- [ ] Service quotas cover VPC, Elastic IP, NAT gateway, RDS, KMS, IAM, ECR, ECS,
      and CloudWatch resources in `us-west-1`.
- [ ] Tier 1 regional-disaster limitation is accepted or a secondary-region
      recovery change is separately approved.
- [ ] Database class, allocated storage, and 35-day backup retention match the
      approved cost and recovery records.
- [ ] The full source SHA is on `main`; CI and Security passed for that SHA.
- [ ] The plan evidence contains the exact change-set name, change reference,
      cost-review reference, and selected capacity.
- [ ] The CloudFormation change set has been reviewed for replacement, deletion,
      public-access, IAM, encryption, route, and data-retention changes.
- [ ] An accountable operator and rollback/escalation contact are available for
      the apply window.

## Execution rules

Run `plan` first. It may create only an unexecuted CloudFormation change set.
Run `apply` separately with the exact plan inputs and change-set name. Do not use
`--disable-rollback`, bypass the protected environment, or apply a changed plan.
For an update, stop when CloudFormation proposes replacement or deletion of the
database, KMS key, retained log group, ECR repository, or network without a
separately approved data-preservation procedure.

Successful foundation creation is infrastructure evidence, not application
validation or production approval. Capture the workflow URL and output artifact
in the controlled deployment record before configuring the service release.

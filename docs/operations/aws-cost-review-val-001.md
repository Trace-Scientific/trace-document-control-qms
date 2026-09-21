# AWS-COST-VAL-001 — AWS validation foundation cost review

## Status

**Budgetary review for PLAN authorization.** This record supports creation and review of an unexecuted CloudFormation change set only. It is not approval to APPLY the foundation stack or to incur ongoing validation-environment charges.

Prepared: 2026-09-21  
Target account: `181027096118`  
Target Region: `us-west-1` — US West (N. California)  
Application candidate: `0.1.0-rc.6`  
Frozen application SHA: `ae98a440b22e3b5bfc96f2e14672c31c8bb342bd`  
Foundation workflow baseline: `97b4cd0bdcbaebc189633b715d7dca2872dc721d`

## Reviewed foundation configuration

The governed foundation template proposes:

- one VPC spanning two Availability Zones;
- two public subnets, two application subnets, and two isolated database subnets;
- two NAT gateways and two Elastic IP addresses;
- encrypted PostgreSQL 17 on Amazon RDS using `db.m7g.large`;
- Multi-AZ database deployment with one standby;
- 100 GiB General Purpose SSD (`gp3`) allocated database storage;
- 35-day automated-backup retention;
- deletion protection and snapshot-on-delete/update-replace behavior;
- Performance Insights and PostgreSQL/upgrade log export;
- one customer-managed KMS key with automatic rotation;
- one ECS cluster with Container Insights enabled but no continuously running application task at the foundation stage;
- one encrypted immutable ECR repository; and
- a retained application CloudWatch Logs group with 365-day retention.

The foundation template does **not** yet create the application load balancer or continuously running Fargate application tasks. Those costs require a separate service-release cost review before service APPLY.

## Current AWS pricing basis

AWS uses pay-as-you-go pricing for the covered services. RDS Multi-AZ with one standby provisions and bills a primary DB instance and standby in different Availability Zones. NAT gateways are billed for each gateway-hour plus each gigabyte processed. Customer-managed KMS keys have a monthly key-storage charge plus request charges. ECR is billed primarily by stored image data and applicable transfer, while CloudWatch Logs costs depend on ingestion, retention, queries, and related observability usage.

Current public AWS pricing documentation was reviewed on 2026-09-21. Exact `us-west-1` unit prices and estimated monthly total must be reconfirmed in the AWS Pricing Calculator immediately before APPLY because AWS pricing and usage assumptions can change.

## Budgetary monthly estimate

The following is a conservative planning range, not an AWS quote.

| Cost component | Planning basis | Budgetary monthly allowance |
| --- | --- | ---: |
| RDS PostgreSQL compute | `db.m7g.large`, Multi-AZ, 730 hours/month | $325–$425 |
| RDS gp3 storage and routine backup overhead | 100 GiB allocated; 35-day retention; snapshot growth depends on database usage | $25–$60 |
| Two NAT gateways | 2 gateways x 730 hours; excludes variable GB processing | $70–$90 |
| NAT data processing / regional transfer | Validation traffic dependent | $0–$40 |
| Public IPv4 / Elastic IP related charges | 2 NAT EIPs where applicable | $5–$10 |
| Customer-managed KMS key and normal low-volume requests | 1 key; normal validation request volume | $1–$5 |
| ECR private image storage | Small number of immutable validation images | $1–$5 |
| CloudWatch Logs / Container Insights / RDS log export | Low-volume validation workload; usage dependent | $5–$25 |
| Other small foundation API/storage charges | CloudFormation itself has no stack fee; minor service usage may vary | $0–$10 |

**Foundation planning range: approximately $432–$670 per month before credits and taxes.**

For governance and budget approval, use a rounded ceiling of:

**$700/month for the foundation-only validation environment**

until real usage data is available.

## Free-plan / credit treatment

The AWS account was opened under the current AWS Free plan and may have promotional credits available. Credits can reduce the cash amount billed while eligible, but this review treats credits as temporary and does not rely on them for the long-term operating-cost decision.

Before APPLY, verify that the account plan permits the proposed long-running resources without automatic account closure or service interruption at free-plan expiration/credit depletion. If necessary, upgrade the account before qualified validation infrastructure becomes dependent on continued account availability.

## Cost risks and controls

1. **RDS is the dominant fixed cost.** Multi-AZ is retained because the validation architecture requires resilience representative of the Tier 1 production design.
2. **Two NAT gateways are intentionally retained for Availability-Zone resilience.** NAT gateway hourly and data-processing charges continue while provisioned.
3. **Backup and snapshot cost grows with changed data and retained snapshots.** The database has deletion protection and snapshot-preservation controls, so deletion does not necessarily end all storage charges.
4. **Logs can grow materially.** Application and database log volumes must be reviewed after qualification runs.
5. **The service layer is excluded.** Running Fargate tasks, an ALB, service alarms, secrets, and service traffic are subject to a later controlled cost review.
6. **No Reserved Instance/Savings Plan commitment is approved for validation at this stage.** Initial qualification should use on-demand pricing until workload size and duration are known.
7. **No APPLY is authorized by this document alone.** The unexecuted CloudFormation change set must first be reviewed for resource count, replacement/deletion behavior, public exposure, and cost-relevant configuration.

## PLAN authorization recommendation

`AWS-COST-VAL-001` is sufficient as the **cost-review reference for a PLAN-only workflow run** using:

- `database_instance_class = db.m7g.large`
- `database_allocated_storage = 100`
- `BackupRetentionDays = 35`
- `cost_acknowledged = true`

because PLAN creates an **unexecuted** CloudFormation change set and does not execute the stack.

## APPLY gate

Before any foundation APPLY:

- capture a current AWS Pricing Calculator estimate for `us-west-1`;
- reconcile it against the $700/month foundation ceiling;
- verify current free-plan/credit implications;
- review the generated change set and exact resource inventory;
- confirm service quotas in `us-west-1`;
- record accountable approval for the ongoing cost; and
- stop for separate approval if the expected foundation run rate exceeds $700/month or materially changes this configuration.

## Evidence sources

Public AWS pricing documentation reviewed 2026-09-21:

- Amazon RDS for PostgreSQL pricing — Multi-AZ billing and storage model.
- Amazon VPC / NAT gateway pricing — hourly gateway and per-GB processing model.
- AWS KMS pricing — customer-managed key and request pricing.
- Amazon ECR pricing — private repository storage and transfer model.
- Amazon CloudWatch pricing — usage-based logs and observability pricing.
- AWS general pricing — pay-as-you-go pricing model.

This cost record is a planning and validation-control artifact. It is not a contractual AWS price quote.

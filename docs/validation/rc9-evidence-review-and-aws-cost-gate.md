# RC.9 candidate evidence review and AWS cost gate

## Candidate

Release: `0.1.0-rc.9`

Immutable candidate SHA:

`3d32a39d7a31e4acdfe63891b46a8139c9465876`

## Exact-candidate automated evidence

The following post-merge runs completed successfully for the exact immutable candidate SHA:

- CI run #2902
- Security run #779

These exact-SHA runs are the authoritative automated release-candidate evidence. Earlier PR-head runs are supplementary only.

## Repository state at evidence review

At review start:

- controlled `main` matched the immutable rc.9 SHA;
- 0 open pull requests;
- 0 open issues;
- historical rc.6, rc.7, and rc.8 records remained frozen.

## Validation package status

Implementation traceability is present for `UR-001` through `UR-033`.

Controlled UAT protocols cover `UAT-01` through `UAT-57`.

These protocols remain planned validation evidence until executed against rc.9 in the approved validation environment using synthetic data.

## Remaining validation-execution evidence

The following items remain required before controlled production release:

1. protected AWS validation-environment qualification for the immutable rc.9 candidate;
2. migration/integrity and environment-readiness evidence;
3. applicable `UAT-01` through `UAT-57` execution;
4. recovery, restore, deployment, and rollback rehearsal evidence;
5. deviation disposition and residual-risk approval where applicable;
6. quality, security, and product/service-owner human release approvals;
7. governed User Manual / Help publication only at the approved release point.

Automated CI/Security success does not replace these execution and approval requirements.

## AWS architecture reviewed at cost gate

The controlled validation templates currently specify, in `us-west-1`:

- two Availability Zones;
- two NAT gateways;
- encrypted Multi-AZ PostgreSQL 17 RDS using `db.m7g.large` by default;
- 100 GB gp3 database storage with 35-day backup retention;
- two always-on ECS Fargate tasks at 0.5 vCPU / 1 GB each, autoscaling to six;
- internet-facing Application Load Balancer;
- ECR, KMS, CloudWatch Logs/alarms, SNS, Secrets Manager, Route 53, and ACM;
- private application and database subnets.

## Cost planning status

The existing controlled planning estimate remains approximately:

**$432–$670 per month before credits, taxes, exceptional data transfer, unusual log volume, autoscaling above the two-task baseline, or other unplanned usage.**

The governance ceiling remains:

**$700 per month**

This estimate is a planning range, not a guaranteed invoice. Actual AWS charges vary by regional rates and usage.

New AWS Free Tier accounts may receive up to $200 in credits, but credits are temporary and must not be relied on to satisfy the recurring validation-environment cost model.

## Explicit cost gate

# AWS costs begin here

No AWS foundation or service APPLY is authorized by this record alone.

Before APPLY, the accountable owner must explicitly approve proceeding with the validation environment knowing that:

- recurring AWS charges may begin as soon as provisioned resources become active;
- the controlled planning range is approximately **$432–$670/month**;
- the governance ceiling is **$700/month**;
- credits, if any, reduce billed amounts only while eligible and available;
- NAT gateways, Multi-AZ RDS, load balancing, Fargate, logs, storage, and related managed services may continue to accrue charges until the associated resources are deleted or otherwise stopped where supported.

Required approval wording may be recorded as:

`I approve AWS validation APPLY for rc.9 and acknowledge the estimated recurring cost of $432–$670/month with a $700/month governance ceiling.`

## Boundary

AWS remains **PLAN-only** until that explicit approval is recorded.

No production regulated data is authorized. Validation execution must use synthetic data only.

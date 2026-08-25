# Tier 1 recovery architecture decision

## Approved context

| Decision | Approved value |
| --- | --- |
| Primary AWS region | US West (N. California), `us-west-1` |
| Validation hostname | `traceqms.com` |
| Recovery class | Tier 1 |
| RTO | Less than 1 hour |
| RPO | Seconds to minutes; verification target no more than 5 minutes |
| Interim accountable owner | James Ramsey |

## Primary-region design

The validation foundation spans two Availability Zones. It uses two application
subnets and independent NAT paths, an immutable ECR repository, encrypted RDS
PostgreSQL 17 Multi-AZ, 35-day backups, point-in-time recovery, deletion
protection, and a dedicated rotating KMS key. The service layer must maintain at
least two healthy Fargate tasks distributed across the two zones.

This architecture targets continued operation through a task, host, or single
Availability Zone failure. RDS Multi-AZ failover and ECS replacement behavior
must be exercised and timed during validation; configuration alone is not proof
that the approved RTO or RPO was achieved.

## Regional-disaster limitation

The primary-region stack does not meet Tier 1 objectives for complete loss of
`us-west-1`. Production authorization therefore requires one of the following:

1. approve a secondary AWS region and validate cross-region database replication,
   artifact availability, DNS failover, secrets recovery, and recurring exercises; or
2. formally narrow the Tier 1 scope to task and Availability Zone failures and
   approve a separate regional-disaster objective.

No source-controlled document may claim that active-active regional recovery is
implemented until objective evidence demonstrates it.

## Temporary ownership risk

James Ramsey temporarily holds Quality, Security, and Service ownership. This is
acceptable for preliminary validation coordination, but it does not demonstrate
independent segregation of duties. An independent reviewer must approve the
validation evidence, residual risk, and production release before production use.

## Hostname control

The apex hostname `traceqms.com` is reserved for this validation deployment by
the current decision. DNS must not be changed until certificate ownership is
verified and the load balancer is healthy. If the apex will later serve
production, validation evidence must record the hostname transition and the
validation environment must move to a separate controlled hostname.

# Release-candidate certification checklist

Record each item as pass, fail, or not applicable with evidence and an approver.

## Build and traceability

- [ ] A reviewed dependency lockfile exists and the release artifact uses frozen
      dependency installation; until then, release certification is blocked.
- [ ] Release commit matches the approved pull request and change record.
- [ ] CI, CodeQL, dependency audit, tests, migrations, integrity checks, runtime
      smoke tests, and container build are green.
- [ ] Requirements, risk assessment, design, implementation, and test evidence
      are traceable for changed critical functions.
- [ ] Known limitations and residual risks have documented owners and approval.

## Security and privacy

- [ ] Production secrets are present only in the approved secret manager.
- [ ] TLS, network access, database roles, session settings, and tenant isolation
      have been verified.
- [ ] High or critical vulnerabilities are resolved or formally risk accepted.
- [ ] Logs and alerts redact credentials and minimize tenant/personal data.

## Recovery and operations

- [ ] A production-compatible backup exists and its restoration procedure has
      current evidence.
- [ ] RPO/RTO, retention, monitoring, alert routing, and on-call ownership are
      approved.
- [ ] Liveness, readiness, overdue monitoring, notification recovery, rollback,
      and incident escalation have named owners.
- [ ] Deployment and rollback have been rehearsed in the validation environment.

## Quality release decision

- [ ] Validation deviations are closed or approved.
- [ ] Quality owner approves the validation evidence.
- [ ] Product/service owner approves operational readiness.
- [ ] Security owner approves residual security risk.
- [ ] Final decision, approvers, timestamps, release SHA, and environment are
      stored in the controlled release record.

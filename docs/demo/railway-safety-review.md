# Railway demo provisioning safety review

The demo application and PostgreSQL database are separate from production. The demo application has passed its readiness check, and its database migrations are current. A dedicated demo storage bucket has been provisioned, but document upload, retrieval, and scanning have not yet been tested.

## Provisioning requirements

- Keep existing local integration-test database guards unchanged.
- Build a separate Railway demo provisioning entrypoint rather than adapting local test scripts by removing checks.
- Reject execution unless the deployment tier is demo and the expected Railway project, environment, application, and database identities are independently verified.
- Never use a production database URL, fallback credentials, or copied production secrets.
- Provide a read-only dry run and an explicit confirmation for any write operation.
- Create the synthetic laboratory only if its login code is unoccupied; fail closed on collisions.
- Preserve auditability and governed document creation; do not fabricate approvals or signatures.
- Validate storage upload and retrieval, malware scanning, backup recovery, and tenant isolation before sharing access with customers.

## Current status

The Railway demo infrastructure is running. The fictional laboratory, demo accounts, and synthetic documents have not been provisioned. This review does not authorize database writes or public access.

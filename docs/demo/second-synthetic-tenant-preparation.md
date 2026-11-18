# Second synthetic tenant preparation

The proposed Railway demo fixture is `trace-demo-lab-b` (Trace Scientific Demo Laboratory B (SYNTHETIC)). It is distinct from `trace-demo-lab` and scoped to the existing pinned demo environment and database. The first proposed write creates one inactive organization and one linked `DEMO_TENANT_PROVISIONED` event in the same transaction. The fixture contains no user accounts or documents.

The preparation function uses the existing read-only role check, runtime attestation, and collision lookup. The transaction library has no live entry point and requires a distinct confirmation for this fixed fixture. The original tenant path retains its existing identity and confirmation.

Before live execution, record a current backup and isolated recovery evidence and complete the demo-only execution and role review described in the [one-time provisioning contract](one-time-provisioning-verified-contract-2026-11-07.md). That contract names the original tenant. A reviewed execution procedure for this fixture needs to identify `trace-demo-lab-b` explicitly. Keep the existing provisioner read-only. Test database-level collision, concurrent execution, and rollback on disposable PostgreSQL before using any live execution path.

An inactive organization is preparation for acceptance testing. Activation, named test accounts, and synthetic test documents need a governed setup path before the live tenant isolation checks can proceed.

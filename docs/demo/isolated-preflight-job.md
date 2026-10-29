# One-shot Railway demo preflight image

`Dockerfile.demo-preflight` is a dedicated, read-only container image. Its sole command is `node scripts/railway-demo-preflight.mjs`. It does not run migrations or start a web server.

**Not ready to deploy:** The existing runtime attestation pins `RAILWAY_SERVICE_ID` to the demo web application's service ID. A separate preflight service has a different ID and will correctly be refused. Before deploying this image, create a dedicated service **in the demo environment only**, record its actual Railway service ID, and update the runtime allowlist and tests in a reviewed PR. Do not override or spoof `RAILWAY_SERVICE_ID`.

The job also requires the demo database connection and explicit database service identity. It must never inherit production credentials or deploy into production. Run only once on an approved service after all checks pass; inspect its logs for `READ_ONLY` and `writesPerformed: 0`. No public domain is needed.

This PR only adds the container definition. It does not create, configure, or execute a Railway service. It does not authorize tenant provisioning.

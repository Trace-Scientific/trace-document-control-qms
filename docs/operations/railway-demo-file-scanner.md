# Railway demo file scanner

The synthetic `trace-demo-lab` tenant uses a separate ClamAV worker for pending uploads. The worker runs in the Railway `demo` environment using `Dockerfile.demo-file-scanner` and needs no public domain, database credentials, or bucket credentials.

1. Deploy the worker in Railway `demo` only. Set `DEPLOYMENT_TIER` to `demo`.
2. Configure the same dedicated `DEMO_FILE_SCAN_SECRET` on the demo app and its worker using Railway secrets. Use at least 32 characters from a secure random source. Restart the demo app to load the secret before starting the worker.
3. Check the worker log for a successful signature update. Upload a synthetic checklist or open an existing pending demo upload. After a successful scan, confirm the file appears under **Select existing file** and that the scan audit event is recorded.

The authenticated queue provides pending files only for the active synthetic tenant. The app verifies size, storage key scope and SHA-256 before returning file bytes. The worker submits a verdict only after the scanner returns an explicit result. Download, signature update, and engine failures leave files pending for retry. Duplicate callbacks cannot create a second scan audit event. Investigate persistent pending files through the worker log and storage availability. Keep quarantined files out of the training evidence workflow.

# Railway demo file scanner

The synthetic `trace-demo-lab` tenant uses a separate ClamAV worker for pending uploads. The worker runs in the Railway `demo` environment using `Dockerfile.demo-file-scanner` and needs no public domain, database credentials, or bucket credentials.

1. Deploy the worker in Railway `demo` only. Set `DEPLOYMENT_TIER` to `demo`.
2. Configure the same dedicated `DEMO_FILE_SCAN_SECRET` on the demo app and its worker using Railway secrets. Use at least 32 characters from a secure random source. Restart the demo app to load the secret before starting the worker.
3. Check the worker log for a successful signature update. Upload a synthetic checklist or open an existing pending demo upload. Keep the evidence form open while it checks scan status. After a successful scan, confirm the file appears under **Select existing file** without reloading the page and that the scan audit event is recorded. If automatic checks pause, use **Check scan status** to refresh the list in place.

The authenticated queue provides pending files only for the active synthetic tenant. The app verifies size, storage key scope and SHA-256 before returning file bytes. The worker submits a verdict only after the scanner returns an explicit result. Download, signature update, and engine failures leave files pending for retry. Duplicate callbacks cannot create a second scan audit event. Investigate persistent pending files through the worker log and storage availability. Keep quarantined files out of the training evidence workflow.

## Live acceptance on November 23, 2026

[PR #613](https://github.com/Trace-Scientific/trace-document-control-qms/pull/613) was live on the Railway demo app when the Training completion form was tested with `Trace_QMS_Demo_Scan_Status_PR613.txt`.

| Pacific time | Observed result |
| --- | --- |
| 2:42:46 PM | The upload succeeded and the form showed the file awaiting scan. |
| 2:43:42 PM | The demo Audit trail showed `FILE_SCAN_COMPLETED` with result `CLEAN`. The event and `EVIDENCE_FILE_UPLOADED_PENDING_SCAN` shared FileObject `fc269887-cb47-4784-826a-a70dddf48ce8` and the same SHA-256. |
| 2:43:47 PM | The next evidence-list request succeeded. The open form showed the file as available under **Select existing file** and retained the draft result text. |

The test file remains available and unattached in the synthetic tenant. It documents the scan-status test and should stay out of training completion records.

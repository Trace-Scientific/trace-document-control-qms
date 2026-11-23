"""Scan pending synthetic demo files and submit only completed scan results."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


MAX_BYTES = 25 * 1024 * 1024
DEMO_ENDPOINT = "https://trace-qms-demo-demo.up.railway.app/api/internal/files/demo-scan"
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class DemoScanAPI:
    def __init__(self, secret):
        if len(secret) < 32:
            raise ValueError("A dedicated file-scanning secret is required")
        self.headers = {"Authorization": f"Bearer {secret}"}
        self.opener = build_opener(NoRedirect())

    def request(self, *, params=None, payload=None, limit=MAX_BYTES):
        url = DEMO_ENDPOINT + (f"?{urlencode(params)}" if params else "")
        data = None if payload is None else json.dumps(payload).encode()
        headers = dict(self.headers)
        if data is not None:
            headers["Content-Type"] = "application/json"
        with self.opener.open(Request(url, data=data, headers=headers), timeout=30) as response:
            output = response.read(limit + 1)
        if len(output) > limit:
            raise ValueError("Unexpected response size")
        return output


def scan_file(content, database):
    if not content:
        raise ValueError("Empty file")
    with tempfile.TemporaryDirectory(prefix="trace-demo-scan-") as workspace:
        file = Path(workspace) / "evidence"
        file.write_bytes(content)
        result = subprocess.run(
            ["clamscan", f"--database={database}", "--no-summary", "--alert-exceeds-max=yes",
             "--alert-encrypted=yes", "--max-filesize=25M", "--max-scansize=100M", str(file)],
            timeout=120,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    # Engine errors and incomplete inspection leave the file pending.
    if result.stderr.strip():
        return None
    if result.returncode == 0 and result.stdout.rstrip().endswith(b": OK"):
        return "CLEAN"
    if result.returncode == 1 and result.stdout.rstrip().endswith(b" FOUND"):
        return "MALICIOUS"
    return None


def scan_pending(api, database, scanner=scan_file):
    after = None
    while True:
        rows = json.loads(api.request(params={"after": after} if after else None, limit=8192))["data"]
        if not rows:
            return
        for row in rows:
            file_id = row["id"]
            org_id = row["organizationId"]
            if not UUID.fullmatch(file_id) or not UUID.fullmatch(org_id):
                raise ValueError("Unexpected queue identifiers")
            try:
                content = api.request(params={"fileId": file_id})
                verdict = scanner(content, database)
                if verdict:
                    api.request(payload={"fileId": file_id, "organizationId": org_id, "result": verdict}, limit=8192)
                else:
                    print("Scan incomplete. File remains pending.")
            except (OSError, ValueError, subprocess.SubprocessError):
                print("File scan or result delivery failed. The pending queue will be checked again.")
        after = file_id


def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_NAME") != "demo" or os.environ.get("DEPLOYMENT_TIER") != "demo":
        raise SystemExit("The file scanner can run only in the Railway demo environment")
    api = DemoScanAPI(os.environ.get("DEMO_FILE_SCAN_SECRET", ""))
    with tempfile.TemporaryDirectory(prefix="trace-demo-signatures-") as database:
        config = Path(database) / "freshclam.conf"
        config.write_text(
            f"DatabaseDirectory {database}\nDatabaseOwner clamav\nDatabaseMirror database.clamav.net\n",
            encoding="utf-8",
        )
        last_refresh = None
        while True:
            if last_refresh is None or time.monotonic() - last_refresh >= 6 * 60 * 60:
                try:
                    subprocess.run(["freshclam", f"--config-file={config}", "--stdout"], timeout=600, check=True)
                except (OSError, subprocess.SubprocessError):
                    print("Signature update failed. Scanning paused.")
                    time.sleep(300)
                    continue
                last_refresh = time.monotonic()
                print("Signature update succeeded. Checking the demo queue.")
            try:
                scan_pending(api, database)
            except (OSError, ValueError, KeyError):
                print("Unable to read the demo scan queue. Retrying.")
            time.sleep(60)


if __name__ == "__main__":
    main()

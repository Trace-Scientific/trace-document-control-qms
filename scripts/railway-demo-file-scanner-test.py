import importlib.util
import json
from pathlib import Path
from subprocess import CompletedProcess
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("scanner", Path(__file__).with_name("railway-demo-file-scanner.py"))
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
FILE_ID = "26db892d-5677-4b58-8a0e-d5fc4cae16b0"
ORG_ID = "19edf975-eb67-47f2-b3bf-b8d20653e72c"


class Queue:
    def __init__(self):
        self.results = []

    def request(self, *, params=None, payload=None, limit=None):
        if payload is not None:
            self.results.append(payload)
            return b"{}"
        if params and "fileId" in params:
            return b"Synthetic demo evidence"
        data = [] if params else [{"id": FILE_ID, "organizationId": ORG_ID}]
        return json.dumps({"data": data}).encode()


class ScanTest(unittest.TestCase):
    @patch.object(scanner.subprocess, "run")
    def test_requires_conclusive_engine_output(self, run):
        for code, output, errors, expected in [
            (0, b"/tmp/evidence: OK\n", b"", "CLEAN"),
            (1, b"/tmp/evidence: Test-Signature FOUND\n", b"", "MALICIOUS"),
            (0, b"", b"", None),
            (0, b"/tmp/evidence: OK\n", b"engine warning", None),
            (2, b"", b"scan error", None),
        ]:
            with self.subTest(code=code, output=output, errors=errors):
                run.return_value = CompletedProcess([], code, output, errors)
                self.assertEqual(scanner.scan_file(b"synthetic", "/signatures"), expected)

    def test_reports_only_completed_scans(self):
        for result in ["CLEAN", "MALICIOUS", None]:
            with self.subTest(result=result):
                queue = Queue()
                scanner.scan_pending(queue, "/signatures", lambda content, database: result)
                expected = [{"fileId": FILE_ID, "organizationId": ORG_ID, "result": result}] if result else []
                self.assertEqual(queue.results, expected)


if __name__ == "__main__":
    unittest.main()

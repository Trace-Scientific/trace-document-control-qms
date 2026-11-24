#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${AWS_ACCESS_KEY_ID:?missing access key}"
: "${AWS_SECRET_ACCESS_KEY:?missing secret key}"
: "${AWS_DEFAULT_REGION:?missing region}"
: "${S3_BACKUP_BUCKET:?missing bucket}"
: "${RESTORE_BACKUP_NAME:?missing backup name}"
[[ "${DEPLOYMENT_TIER:-}" == "demo" ]] || { echo "REFUSED: demo tier required"; exit 1; }
[[ "$S3_BACKUP_BUCKET" == "trace-qms-demo-db-backups" && "$AWS_DEFAULT_REGION" == "us-east-2" ]] || { echo "REFUSED: unexpected S3 target"; exit 1; }
[[ "$RESTORE_BACKUP_NAME" =~ ^trace-qms-demo-[0-9]{8}T[0-9]{6}Z\.backup$ ]] || { echo "REFUSED: invalid backup filename"; exit 1; }
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE DATABASE_URL || true
work="$(mktemp -d)"
app_pid=""
cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -f "$work/pgdata/postmaster.pid" ]]; then
    pg_ctl -D "$work/pgdata" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
cd "$work"
echo "Downloading demo backup and checksum"
aws s3 cp "s3://$S3_BACKUP_BUCKET/demo/postgres/$RESTORE_BACKUP_NAME" "$RESTORE_BACKUP_NAME" --only-show-errors
aws s3 cp "s3://$S3_BACKUP_BUCKET/demo/postgres/$RESTORE_BACKUP_NAME.sha256" "$RESTORE_BACKUP_NAME.sha256" --only-show-errors
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
sha256sum -c "$RESTORE_BACKUP_NAME.sha256"
pg_restore --list "$RESTORE_BACKUP_NAME" >/dev/null
mkdir -m 700 "$work/socket"
initdb -D "$work/pgdata" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$work/pgdata" -o "-c listen_addresses='127.0.0.1' -c unix_socket_directories=$work/socket" -w start >/dev/null
createdb -h "$work/socket" -U postgres restore_validation
echo "Restoring into disposable, local-only PostgreSQL 18"
pg_restore -h "$work/socket" -U postgres -d restore_validation --no-owner --no-acl --exit-on-error "$RESTORE_BACKUP_NAME"
table_count="$(psql -h "$work/socket" -U postgres -d restore_validation -Atqc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
[[ "$table_count" =~ ^[0-9]+$ ]] && (( table_count > 0 )) || { echo "FAIL: no application tables restored"; exit 1; }
echo "PASS: isolated restore completed; application tables: $table_count"
echo "No running Railway database was contacted or modified."

echo "Starting Trace QMS on loopback against the restored database"
(
  cd /opt/trace-qms
  exec env -i PATH="$PATH" HOME="$work" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 PORT=3000 \
    DATABASE_URL=postgresql://postgres@127.0.0.1:5432/restore_validation \
    node server.js
) >"$work/app.log" 2>&1 &
app_pid=$!

if ! node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const base = "http://127.0.0.1:3000";
const request = (path) => fetch(base + path, { signal: AbortSignal.timeout(1500) });
const deadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await request("/api/health/readiness");
    const result = await response.json();
    ready = response.ok && result.status === "ready"
      && result.checks.some(({ name, status }) => name === "database" && status === "ok");
    if (ready) break;
  } catch {
    // The server may still be starting.
  }
  await setTimeout(1000);
}

assert.ok(ready, "Restored database readiness did not pass");
const documents = await request("/api/documents");
assert.equal(documents.status, 401, "Unauthenticated document request must be denied");

const password = process.env.RESTORE_DEMO_PASSWORD;
if (password) {
  const root = "http://127.0.0.1:3000";
  const login = await fetch(root + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organizationCode: "trace-demo-lab", email: "alex.morgan@example.com", password,
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(login.status, 200, "Restored demo account login did not succeed");
  const session = login.headers.getSetCookie()
    .find((cookie) => cookie.startsWith("qms_session="))?.split(";")[0];
  assert.ok(session, "Restored demo login did not issue a session");

  const response = await fetch(root + "/api/documents?query=TEST-001", {
    headers: { Cookie: session },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, "Restored document lookup did not succeed");
  const { data } = await response.json();
  assert.ok(data.items.some((item) => item.documentNumber === "TEST-001"
    && item.title === "QMS Workflow Verification — Demo"),
    "Expected synthetic document is missing from the restored demo tenant");
  console.log("PASS: authenticated demo login and restored TEST-001 document lookup");
} else {
  console.log("SKIP: authenticated restore check requires RESTORE_DEMO_PASSWORD");
}
NODE
then
  tail -30 "$work/app.log" >&2
  exit 1
fi

echo "PASS: Trace QMS started against the restored database; readiness passed and unauthenticated documents returned 401"

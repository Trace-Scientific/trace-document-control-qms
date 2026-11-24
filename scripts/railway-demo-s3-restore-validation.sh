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
# libpq must resolve every connection to the disposable cluster.
for variable in "${!PG@}"; do unset "$variable"; done
unset DATABASE_URL
restore_helpers=/opt/demo-restore
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
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$work"
storage_env=()
file_id="${RESTORE_PRIVATE_FILE_ID:-}"
all_files="${RESTORE_PRIVATE_FILES_ALL:-0}"
[[ "$all_files" == 0 || "$all_files" == 1 ]] || { echo "REFUSED: invalid multi-file opt-in"; exit 1; }
if [[ "$all_files" == 1 ]]; then
  [[ -z "$file_id" && -n "${RESTORE_DEMO_PASSWORD:-}" ]] || { echo "REFUSED: manifest recovery requires restored login and no single-file selection"; exit 1; }
fi
if [[ -n "$file_id" ]]; then
  [[ "$file_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ &&
     -n "${RESTORE_DEMO_PASSWORD:-}" ]] || {
    echo "REFUSED: private-file validation requires a file UUID and restored demo login"
    exit 1
  }
fi
if [[ -n "$file_id" || "$all_files" == 1 ]]; then
  storage_env=(
    OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
    OBJECT_STORAGE_REGION=us-east-2
    OBJECT_STORAGE_BUCKET=restore-files
    OBJECT_STORAGE_ACCESS_KEY_ID=loopback-only
    OBJECT_STORAGE_SECRET_ACCESS_KEY=loopback-only
  )
fi
aws_copy() {
  env -i PATH="$PATH" HOME="$work" AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN:-}" \
    AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" AWS_EC2_METADATA_DISABLED=true \
    AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
    aws s3 cp "$1" "$2" --only-show-errors
}
echo "Downloading demo backup and checksum"
aws_copy "s3://$S3_BACKUP_BUCKET/demo/postgres/$RESTORE_BACKUP_NAME" "$RESTORE_BACKUP_NAME"
aws_copy "s3://$S3_BACKUP_BUCKET/demo/postgres/$RESTORE_BACKUP_NAME.sha256" "$RESTORE_BACKUP_NAME.sha256"
if [[ -n "$file_id" ]]; then
  echo "Downloading the selected archive's private-file backup"
  aws_copy "s3://$S3_BACKUP_BUCKET/demo/private-files/$RESTORE_BACKUP_NAME/$file_id" \
    recovery-object
  [[ -s recovery-object && "$(wc -c < recovery-object)" -le 26214400 ]] || {
    echo "FAIL: private-file backup must be between 1 byte and 25 MiB"
    exit 1
  }
fi
# Check the digest for this exact file before invoking PostgreSQL.
sha256sum "$RESTORE_BACKUP_NAME" | cmp -s - "$RESTORE_BACKUP_NAME.sha256" || {
  echo "FAIL: archive checksum mismatch"
  exit 1
}
echo "PASS: archive checksum verified"
pg_restore --list "$RESTORE_BACKUP_NAME" >/dev/null
mkdir -m 700 "$work/socket"
initdb -D "$work/pgdata" -U postgres --auth=trust --no-instructions >/dev/null
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u RESTORE_DEMO_PASSWORD \
  pg_ctl -D "$work/pgdata" -l "$work/postgres.log" -o "-c listen_addresses='127.0.0.1' -c unix_socket_directories=$work/socket" -w start >/dev/null
createdb -p 5432 -h "$work/socket" -U postgres restore_validation
echo "Restoring into disposable, local-only PostgreSQL 18"
pg_restore -p 5432 -h "$work/socket" -U postgres -d restore_validation --no-owner --no-acl --exit-on-error "$RESTORE_BACKUP_NAME"
table_count="$(psql -p 5432 -h "$work/socket" -U postgres -d restore_validation -XAtqc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
[[ "$table_count" =~ ^[0-9]+$ ]] && (( table_count > 0 )) || { echo "FAIL: no application tables restored"; exit 1; }
echo "PASS: isolated restore completed; application tables: $table_count"
echo "No running Railway database was contacted or modified."

if [[ -n "$file_id" ]]; then
  psql -p 5432 -h "$work/socket" -U postgres -d restore_validation -XAt \
    -v ON_ERROR_STOP=1 -v "file_id=$file_id" -f - > object-key <<'SQL'
SELECT f."storageKey"
FROM "FileObject" f
JOIN "Organization" o ON o.id = f."organizationId"
WHERE f.id = :'file_id'::uuid
  AND o."loginCode" = 'trace-demo-lab'
  AND f.status = 'AVAILABLE'
  AND f."storageKey" = f."organizationId"::text || '/' || f.id::text || '/' || f."originalName";
SQL
  [[ -s object-key ]] || { echo "FAIL: selected private-file metadata is missing from the restored demo archive"; exit 1; }
fi

if [[ "$all_files" == 1 ]]; then
  psql -p 5432 -h "$work/socket" -U postgres -d restore_validation -XAt -v ON_ERROR_STOP=1 > inventory.json <<'SQL'
SELECT coalesce(json_agg(json_build_object(
  'id', f.id, 'organizationId', f."organizationId", 'originalName', f."originalName",
  'storageKey', f."storageKey", 'sizeBytes', f."sizeBytes", 'sha256', f.sha256
) ORDER BY f.id), '[]'::json)
FROM "FileObject" f JOIN "Organization" o ON o.id = f."organizationId"
WHERE o."loginCode" = 'trace-demo-lab' AND f.status = 'AVAILABLE';
SQL
  prefix="s3://$S3_BACKUP_BUCKET/demo/private-files/$RESTORE_BACKUP_NAME"
  aws_copy "$prefix/manifest.json" manifest.json
  node "$restore_helpers/demo-private-restore.mjs" list "$RESTORE_BACKUP_NAME" > ids
  mkdir -m 700 objects
  while IFS= read -r id; do
    aws_copy "$prefix/$id" "objects/$id"
  done < ids
  node "$restore_helpers/demo-private-restore.mjs" verify "$RESTORE_BACKUP_NAME"
fi
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
echo "Starting Trace QMS on loopback against the restored database"
(
  cd /opt/trace-qms
  exec env -i PATH="$PATH" HOME="$work" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 PORT=3000 \
    DATABASE_URL=postgresql://postgres@127.0.0.1:5432/restore_validation \
    "${storage_env[@]}" node server.js
) >"$work/app.log" 2>&1 &
app_pid=$!

if ! node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
import { pipeline } from "node:stream/promises";

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

  if (process.env.RESTORE_PRIVATE_FILES_ALL === "1") {
    const rows = JSON.parse(await readFile("inventory.json", "utf8"));
    const objects = new Map(rows.map((row) => [
      "/restore-files/" + row.storageKey.split("/").map(encodeURIComponent).join("/"),
      row.id,
    ]));
    let corrupt = false;
    const storage = createServer((req, res) => {
      const id = objects.get(req.url);
      if (req.method !== "GET" || !id) return res.writeHead(404).end();
      if (id === corrupt?.id) {
        return res.writeHead(200).end(Buffer.alloc(corrupt.sizeBytes === 0 ? 1 : 0));
      }
      void pipeline(createReadStream("objects/" + id), res).catch(() => res.destroy());
    });
    storage.listen(9000, "127.0.0.1");
    await once(storage, "listening");
    try {
      for (const row of rows) {
        const path = "/api/files/" + row.id;
        const denied = await request(path);
        assert.equal(denied.status, 401, "Private file must require authentication");
        await denied.body?.cancel();
        const download = () => fetch(base + path, {
          headers: { Cookie: session }, signal: AbortSignal.timeout(30000),
        });
        const recovered = await download();
        assert.equal(recovered.status, 200, "Restored private file could not be downloaded");
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of recovered.body) {
          size += chunk.length;
          assert.ok(size <= row.sizeBytes, "Recovered response exceeds expected size");
          hash.update(chunk);
        }
        assert.equal(size, row.sizeBytes, "Recovered download size mismatch");
        assert.equal(hash.digest("hex"), row.sha256, "Recovered download SHA-256 mismatch");
        corrupt = row;
        const mismatched = await download();
        assert.equal(mismatched.status, 409, "Restored database hash must reject corrupted object bytes");
        await mismatched.body?.cancel();
        corrupt = false;
      }
    } finally {
      storage.close();
      storage.closeAllConnections();
    }
    console.log("PASS: authenticated recovery and denial checks; files:", rows.length);
  }
  const fileId = process.env.RESTORE_PRIVATE_FILE_ID;
  if (fileId) {
    const key = (await readFile("object-key", "utf8")).trimEnd();
    const objectPath = `/restore-files/${key.split("/").map(encodeURIComponent).join("/")}`;
    const bytes = await readFile("recovery-object");
    const sha256 = (value) => createHash("sha256").update(value).digest("hex");
    let corrupt = false;
    const storage = createServer((req, res) => {
      if (req.method !== "GET" || req.url !== objectPath) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" })
        .end(corrupt ? "Intentionally corrupted recovery fixture" : bytes);
    });
    storage.listen(9000, "127.0.0.1");
    storage.unref();
    await once(storage, "listening");

    const filePath = `/api/files/${fileId}`;
    const unauthenticated = await request(filePath);
    assert.equal(unauthenticated.status, 401, "Private file must require authentication");

    const download = () => fetch(base + filePath, {
      headers: { Cookie: session },
      signal: AbortSignal.timeout(5000),
    });
    const recovered = await download();
    assert.equal(recovered.status, 200, "Restored private file could not be downloaded");
    assert.equal(sha256(Buffer.from(await recovered.arrayBuffer())), sha256(bytes),
      "Downloaded private file does not match the recovered object bytes");

    corrupt = true;
    const mismatched = await download();
    assert.equal(mismatched.status, 409, "Restored database hash must reject corrupted object bytes");
    console.log("PASS: restored private file download, SHA-256, and denial checks");
  }
} else {
  console.log("SKIP: authenticated restore check requires RESTORE_DEMO_PASSWORD");
}
NODE
then
  tail -30 "$work/app.log" >&2
  exit 1
fi

echo "PASS: Trace QMS started against the restored database; readiness passed and unauthenticated documents returned 401"

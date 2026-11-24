#!/usr/bin/env bash
set -Eeuo pipefail

restore_fixture="$(mktemp -d)"
trap 'rm -rf "$restore_fixture"' EXIT
chmod 755 "$restore_fixture"
backup_name="trace-qms-demo-20000101T000000Z.backup"
file_id="502d9cb2-2280-4f80-899e-e9a45f664101"
second_id="502d9cb2-2280-4f80-899e-e9a45f664102"
cp /tmp/trace-qms.dump "$restore_fixture/$backup_name"
cp "${RUNNER_TEMP:?}/trace-qms-recovery-fixture.txt" "$restore_fixture/$file_id"
cp "$RUNNER_TEMP/trace-qms-recovery-fixture-2.txt" "$restore_fixture/$second_id"
(
  cd "$restore_fixture"
  sha256sum "$backup_name" > "$backup_name.sha256"
  node --input-type=module - "$backup_name" "$file_id" "$second_id" <<'NODE' > manifest.json
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [archive, ...ids] = process.argv.slice(2);
const files = ids.map((id) => {
  const bytes = readFileSync(id);
  return { id, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
console.log(JSON.stringify({ archive, files }));
NODE
  chmod a+r "$backup_name" "$backup_name.sha256" manifest.json "$file_id" "$second_id"
)
cat > "$restore_fixture/aws" <<'SCRIPT'
#!/bin/sh
set -eu
test "$1" = s3
test "$2" = cp
case "$3" in
  s3://trace-qms-demo-db-backups/demo/postgres/trace-qms-demo-20000101T000000Z.backup|s3://trace-qms-demo-db-backups/demo/postgres/trace-qms-demo-20000101T000000Z.backup.sha256|s3://trace-qms-demo-db-backups/demo/private-files/trace-qms-demo-20000101T000000Z.backup/manifest.json|s3://trace-qms-demo-db-backups/demo/private-files/trace-qms-demo-20000101T000000Z.backup/502d9cb2-2280-4f80-899e-e9a45f66410[12])
    cp "/restore-fixture/${3##*/}" "$4"
    ;;
  *) exit 1 ;;
esac
SCRIPT
chmod 755 "$restore_fixture/aws"

docker build --file Dockerfile.demo-s3-restore-validation --tag trace-qms-restore-validation .
run_restore() {
  docker run --rm --network none \
    --env DEPLOYMENT_TIER=demo --env AWS_DEFAULT_REGION=us-east-2 \
    --env AWS_ACCESS_KEY_ID=ci-fixture --env AWS_SECRET_ACCESS_KEY=ci-fixture \
    --env S3_BACKUP_BUCKET=trace-qms-demo-db-backups --env RESTORE_BACKUP_NAME="$backup_name" \
    --volume "$restore_fixture:/restore-fixture:ro" \
    --volume "$restore_fixture/aws:/usr/local/bin/aws:ro" \
    "$@" trace-qms-restore-validation
}
run_restore
run_restore --env RESTORE_DEMO_PASSWORD --env RESTORE_PRIVATE_FILE_ID="$file_id"
run_restore --env RESTORE_DEMO_PASSWORD --env RESTORE_PRIVATE_FILES_ALL=1 | tee "$restore_fixture/success.log"
grep -F "PASS: manifest reconciled with restored database; verified files: 2" "$restore_fixture/success.log"
grep -F "PASS: authenticated recovery and denial checks; files: 2" "$restore_fixture/success.log"

expect_failure() {
  local expected="$1"
  shift
  if run_restore "$@" > "$restore_fixture/failure.log" 2>&1; then
    echo "Restore unexpectedly succeeded: $expected" >&2
    exit 1
  fi
  if ! grep -F "$expected" "$restore_fixture/failure.log"; then
    cat "$restore_fixture/failure.log" >&2
    exit 1
  fi
}
expect_failure "manifest recovery requires restored login and no single-file selection" \
  --env RESTORE_PRIVATE_FILES_ALL=1
expect_failure "manifest recovery requires restored login and no single-file selection" \
  --env RESTORE_DEMO_PASSWORD --env RESTORE_PRIVATE_FILE_ID="$file_id" --env RESTORE_PRIVATE_FILES_ALL=1
# Change one byte without changing length, so the hash must detect the corruption.
printf X | dd of="$restore_fixture/$second_id" bs=1 count=1 conv=notrunc status=none
expect_failure "Private backup SHA-256 mismatch" \
  --env RESTORE_DEMO_PASSWORD --env RESTORE_PRIVATE_FILES_ALL=1

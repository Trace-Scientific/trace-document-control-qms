#!/bin/bash
set -euo pipefail
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
chmod 755 "$fixture"
cp /tmp/trace-qms.dump "$fixture/archive"
cp "$RUNNER_TEMP/trace-qms-recovery-fixture.txt" "$fixture/object"
chmod 644 "$fixture/archive" "$fixture/object"
mkdir "$fixture/out"
chmod 777 "$fixture/out"
cat > "$fixture/pg_dump" <<'SH'
#!/bin/sh
set -eu
for arg in "$@"; do
  case "$arg" in --file=*) cp /fixture/archive "${arg#--file=}"; exit 0;; esac
done
exit 1
SH
cat > "$fixture/aws" <<'SH'
#!/bin/sh
set -eu
if [ "$1" = s3 ] && [ "$2" = cp ]; then
  cp "$3" "/fixture/out/${4##*/}"
elif [ "$1" = s3api ] && [ "$2" = head-object ]; then
  echo '{}'
elif [ "$1" = --endpoint-url ]; then
  test "$AWS_ACCESS_KEY_ID" = source-fixture
  test "$2" = https://fixture.invalid
  test "$3" = s3api
  test "$4" = get-object
  test "$6" = source-fixture-bucket
  test "$8" = 32e089a4-1deb-4db1-aa29-6c9b12e3ceb1/502d9cb2-2280-4f80-899e-e9a45f664101/recovery-fixture.txt
  cp /fixture/object "$9"
elif [ "$1" = s3api ] && [ "$2" = put-object ]; then
  test "$AWS_ACCESS_KEY_ID" = destination-fixture
  test "$4" = trace-qms-demo-db-backups
  case "$6" in demo/private-files/trace-qms-demo-*.backup/*) ;; *) exit 1;; esac
  test "${10}" = AES256
  cp "$8" "/fixture/out/${6##*/}"
else
  exit 1
fi
SH
chmod 755 "$fixture/aws" "$fixture/pg_dump"
docker build -f Dockerfile.demo-s3-backup -t trace-qms-backup-ci .
docker run --rm --network none \
  -e DEPLOYMENT_TIER=demo -e DEMO_DATABASE_SERVICE_ID=7f2ad369-c21a-486a-8ac4-4a170b1674d3 \
  -e PGHOST=postgres-6qrb.railway.internal -e PGPORT=5432 -e PGDATABASE=railway -e PGUSER=fixture -e PGPASSWORD=fixture \
  -e AWS_ACCESS_KEY_ID=destination-fixture -e AWS_SECRET_ACCESS_KEY=fixture -e AWS_DEFAULT_REGION=us-east-2 \
  -e S3_BACKUP_BUCKET=trace-qms-demo-db-backups -e DEMO_PRIVATE_BACKUP_ENABLED=1 \
  -e DEMO_FILE_SOURCE_ENDPOINT=https://fixture.invalid -e DEMO_FILE_SOURCE_BUCKET=source-fixture-bucket \
  -e DEMO_FILE_SOURCE_REGION=us-east-2 -e DEMO_FILE_SOURCE_ACCESS_KEY_ID=source-fixture -e DEMO_FILE_SOURCE_SECRET_ACCESS_KEY=fixture \
  -v "$fixture:/fixture" -v "$fixture/aws:/usr/local/bin/aws:ro" -v "$fixture/pg_dump:/usr/local/bin/pg_dump:ro" \
  trace-qms-backup-ci
cmp "$fixture/object" "$fixture/out/502d9cb2-2280-4f80-899e-e9a45f664101"
node - "$fixture/out" <<'JS'
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const dir = process.argv[2], manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
assert.equal(manifest.files.length, 1);
assert.ok(fs.existsSync(path.join(dir, manifest.archive)));
const row = manifest.files[0], bytes = fs.readFileSync(path.join(dir, row.id));
assert.equal(row.sizeBytes, bytes.length);
assert.equal(row.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
JS

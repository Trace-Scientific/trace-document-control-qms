#!/bin/sh
# One-shot demo-only logical backup to private S3. No restore, deletion or migration.
set -eu
umask 077

fail() { echo "Demo backup refused: $*" >&2; exit 1; }
for name in DEPLOYMENT_TIER DEMO_DATABASE_SERVICE_ID PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION S3_BACKUP_BUCKET; do
  eval 'value=${'"${name}"'-}'
  [ -n "$value" ] || fail "missing $name"
done
[ "$DEPLOYMENT_TIER" = demo ] || fail "DEPLOYMENT_TIER must be demo"
[ "$DEMO_DATABASE_SERVICE_ID" = "7f2ad369-c21a-486a-8ac4-4a170b1674d3" ] || fail "unexpected demo database service ID"
[ "$PGHOST" = "postgres-6qrb.railway.internal" ] || fail "unexpected demo database hostname"
[ "$PGPORT" = 5432 ] || fail "unexpected database port"
[ "$PGDATABASE" = railway ] || fail "unexpected database name"
[ "$S3_BACKUP_BUCKET" = trace-qms-demo-db-backups ] || fail "unexpected backup bucket"
[ "$AWS_DEFAULT_REGION" = us-east-2 ] || fail "unexpected AWS region"
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
export PGSSLMODE="${PGSSLMODE:-require}"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$workdir/trace-qms-demo-$stamp.backup"
key="demo/postgres/trace-qms-demo-$stamp.backup"
echo "Creating demo-only logical backup at $stamp"
pg_dump --format=custom --compress=6 --no-owner --no-acl --file="$archive"
pg_restore --list "$archive" >/dev/null
sha256sum "$archive" | sed "s|$workdir/||" > "$archive.sha256"
if [ "${DEMO_BACKUP_EXPORT_PREFLIGHT:-0}" != 1 ]; then
echo "Uploading backup and checksum to private S3"
aws s3 cp "$archive" "s3://$S3_BACKUP_BUCKET/$key" --only-show-errors
aws s3 cp "$archive.sha256" "s3://$S3_BACKUP_BUCKET/$key.sha256" --only-show-errors
aws s3api head-object --bucket "$S3_BACKUP_BUCKET" --key "$key" --query '{Size:ContentLength,Encryption:ServerSideEncryption}' --output json
echo "Demo backup uploaded: s3://$S3_BACKUP_BUCKET/$key"
fi
if [ "${DEMO_PRIVATE_BACKUP_ENABLED:-0}" = 1 ] || [ "${DEMO_BACKUP_EXPORT_PREFLIGHT:-0}" = 1 ]; then
  # Extract inventory from an isolated Unix-socket restore.
  (
    unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSSLMODE DATABASE_URL
    mkdir -m 700 "$workdir/socket"
    initdb -D "$workdir/pgdata" -U postgres --auth=trust --no-instructions >/dev/null
    trap 'pg_ctl -D "$workdir/pgdata" -m immediate -w stop >/dev/null 2>&1 || true' EXIT
    pg_ctl -D "$workdir/pgdata" -l "$workdir/postgres.log" -o "-c listen_addresses='' -c unix_socket_directories=$workdir/socket" -w start >/dev/null
    createdb -h "$workdir/socket" -U postgres inventory
    # Restore full archive to preserve schema dependencies; no live database access.
    pg_restore -h "$workdir/socket" -U postgres -d inventory --no-owner --no-acl --exit-on-error "$archive"
    psql -h "$workdir/socket" -U postgres -d inventory -XAt -v ON_ERROR_STOP=1 > "$workdir/files.json" <<'SQL'
SELECT coalesce(json_agg(json_build_object(
  'id', f.id, 'organizationId', f."organizationId", 'loginCode', o."loginCode",
  'status', f.status, 'originalName', f."originalName", 'storageKey', f."storageKey",
  'sizeBytes', f."sizeBytes", 'sha256', f.sha256) ORDER BY f.id), '[]'::json)
FROM "FileObject" f JOIN "Organization" o ON o.id = f."organizationId"
WHERE o."loginCode" = 'trace-demo-lab' AND f.status = 'AVAILABLE';
SQL
  )
  node /opt/demo-backup/demo-private-backup-aws.mjs "$(basename "$archive")" "$workdir/files.json"
else
  echo "Private-file backup disabled; database-only backup"
fi
echo "A separate isolated restore test is still required before declaring recovery verified."

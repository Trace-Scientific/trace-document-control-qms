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
cleanup() {
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
sha256sum -c "$RESTORE_BACKUP_NAME.sha256"
pg_restore --list "$RESTORE_BACKUP_NAME" >/dev/null
mkdir -m 700 "$work/socket"
initdb -D "$work/pgdata" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$work/pgdata" -o "-c listen_addresses='' -c unix_socket_directories=$work/socket" -w start >/dev/null
createdb -h "$work/socket" -U postgres restore_validation
echo "Restoring into disposable, local-only PostgreSQL 18"
pg_restore -h "$work/socket" -U postgres -d restore_validation --no-owner --no-acl --exit-on-error "$RESTORE_BACKUP_NAME"
table_count="$(psql -h "$work/socket" -U postgres -d restore_validation -Atqc "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
[[ "$table_count" =~ ^[0-9]+$ ]] && (( table_count > 0 )) || { echo "FAIL: no application tables restored"; exit 1; }
echo "PASS: isolated restore completed; application tables: $table_count"
echo "No running Railway database was contacted or modified."

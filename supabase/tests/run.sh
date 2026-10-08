#!/usr/bin/env bash
# 資料庫權限測試: a fresh database, the Supabase stand-in, schema.sql twice (it must be safe to re-run), the latest
# migrations on top (they are re-run on live projects), then permissions.sql. Needs psql access to a Postgres 15+
# server as a superuser: PSQL="psql -h localhost -U postgres" supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=${PSQL:-psql}
DB=${DB:-bafin_permissions_test}
$PSQL -q -d postgres -c 'set client_min_messages = warning' -c "drop database if exists $DB" -c "create database $DB"
run() { $PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -c 'set client_min_messages = error' -f - < "$1" > /dev/null; }
run tests/supabase_stub.sql
run schema.sql
run schema.sql
for f in migrations/2026-10-08_security.sql migrations/2026-10-10_quick_login.sql migrations/2026-10-12_quick_login_fix.sql migrations/2026-10-13_save_games.sql; do run "$f"; done
out=$(mktemp)
status=0
$PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f - < tests/permissions.sql > "$out" 2>&1 || status=$?
grep -E 'ok - |FAILED|ERROR|passed|WARNING' "$out" | sed -E 's/^psql:[^ ]+ (NOTICE|WARNING|ERROR): +/\1 /' || true
[ "$status" = 0 ] || echo "資料庫權限測試失敗（$out）"
exit "$status"

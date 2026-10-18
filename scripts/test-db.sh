#!/usr/bin/env bash
# Applique les migrations sur un PostgreSQL 16 éphémère et exécute les tests SQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=""
cleanup() { $RUNAS "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$TMP" 2>/dev/null || true
  RUNAS="runuser -u postgres --"
fi
$RUNAS "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c TimeZone=Europe/Paris" -l "$TMP/log" start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
echo "→ tests"
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/business_rules.sql"
echo "OK"

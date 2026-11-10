#!/usr/bin/env bash
set -euo pipefail

# This fixture only touches its own private PostgreSQL cluster and random tenants.
# No real credentials, existing database or TCP PostgreSQL listener are used.
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
for task_command in initdb pg_ctl psql go node npm curl openssl; do
  command -v "$task_command" >/dev/null || { echo "Missing prerequisite: $task_command" >&2; exit 1; }
done
initdb --version
task_dir=$(mktemp -d /tmp/fnb-web-api.XXXXXX)
task_api_pid=''
cleanup() {
  if [ -n "$task_api_pid" ]; then kill "$task_api_pid" 2>/dev/null || true; wait "$task_api_pid" 2>/dev/null || true; fi
  if [ -f "$task_dir/data/postmaster.pid" ]; then pg_ctl -D "$task_dir/data" -m fast -w stop >/dev/null; fi
  rm -rf -- "$task_dir"
}
trap cleanup EXIT
mkdir "$task_dir/socket"
initdb -D "$task_dir/data" -A trust --no-locale -E UTF8 -U fnb_test_admin >"$task_dir/init.log"
pg_ctl -D "$task_dir/data" -l "$task_dir/postgres.log" -o "-k $task_dir/socket -p 55443 -c listen_addresses=''" -w start
export MIGRATIONS_DATABASE_URL="host=$task_dir/socket port=55443 user=fnb_test_admin dbname=postgres sslmode=disable"
export DATABASE_URL="host=$task_dir/socket port=55443 user=fnb_app dbname=postgres sslmode=disable"
unset PGPASSWORD
psql "$MIGRATIONS_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE ROLE fnb_app LOGIN NOSUPERUSER NOBYPASSRLS;'
cd "$task_root/apps/api"
task_goose="$(go env GOPATH)/bin/goose"
"$task_goose" -dir migrations postgres "$MIGRATIONS_DATABASE_URL" up
"$task_goose" -dir migrations postgres "$MIGRATIONS_DATABASE_URL" down
"$task_goose" -dir migrations postgres "$MIGRATIONS_DATABASE_URL" up
export BOOTSTRAP_TENANT_NAME='Browser Test Tenant' BOOTSTRAP_TENANT_SLUG="web-$(openssl rand -hex 6)"
export BOOTSTRAP_STORE_NAME='Browser Test Store' BOOTSTRAP_STORE_SLUG='test-store'
export BOOTSTRAP_OWNER_NAME='Browser Test Owner' BOOTSTRAP_OWNER_EMAIL='owner@example.test'
export BOOTSTRAP_OWNER_PASSWORD="$(openssl rand -hex 24)"
go run ./cmd/bootstrap >"$task_dir/bootstrap.log"
psql "$MIGRATIONS_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
WITH identity AS (
  INSERT INTO users(email, display_name, password_hash)
  SELECT 'cashier@example.test', 'Browser Test Cashier', password_hash FROM users WHERE email = 'owner@example.test'
  RETURNING id
), membership AS (
  INSERT INTO memberships(tenant_id, user_id, role_slug)
  SELECT t.id, u.id, 'cashier' FROM tenants t CROSS JOIN identity u
  RETURNING id, tenant_id
)
INSERT INTO membership_stores(tenant_id, membership_id, store_id)
SELECT m.tenant_id, m.id, s.id FROM membership m JOIN stores s ON s.tenant_id = m.tenant_id;
SQL
export WEB_TEST_CASHIER_EMAIL='cashier@example.test'
export JWT_SECRET="$(openssl rand -hex 32)" HTTP_ADDRESS='127.0.0.1:18088' WEB_ORIGIN='http://127.0.0.1:5189'
export API_TEST_BASE_URL='http://127.0.0.1:18088'
if [ "${RUN_API_TESTS:-false}" = 'true' ]; then
  export TEST_DATABASE_ADMIN_URL="$MIGRATIONS_DATABASE_URL" TEST_DATABASE_URL="$DATABASE_URL"
  unset TEST_DATABASE_ADMIN_PASSWORD TEST_DATABASE_PASSWORD
  go test -race ./... -count=1
fi
go build -o "$task_dir/api" ./cmd/api
"$task_dir/api" >"$task_dir/api.log" 2>&1 &
task_api_pid=$!
task_ready=false
for task_attempt in {1..40}; do
  if ! kill -0 "$task_api_pid" 2>/dev/null; then echo 'Fixture API stopped; check that port 18088 is available.' >&2; exit 1; fi
  if curl -fsS "$API_TEST_BASE_URL/readyz" >/dev/null 2>&1; then task_ready=true; break; fi
  sleep 0.25
done
if [ "$task_ready" != true ]; then echo 'Fixture API did not become ready.' >&2; exit 1; fi
export WEB_TEST_TENANT="$BOOTSTRAP_TENANT_SLUG" WEB_TEST_EMAIL="$BOOTSTRAP_OWNER_EMAIL" WEB_TEST_PASSWORD="$BOOTSTRAP_OWNER_PASSWORD"
cd "$task_root"
npx playwright test --config playwright.api.config.ts "$@"

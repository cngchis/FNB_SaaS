#!/bin/sh
set -eu

: "${FNB_APP_PASSWORD:?FNB_APP_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_password="$FNB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE fnb_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fnb_app')
\gexec
SELECT format('ALTER ROLE fnb_app WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', :'app_password')
\gexec
SQL

#!/usr/bin/with-contenv bashio
set -euo pipefail

readonly APP_DIR="/app"
readonly INTERNAL_PGDATA="/data/postgres"

APP_PID=0
INTERNAL_POSTGRES_STARTED=false

require_identifier() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    bashio::log.error "${label} must match ^[a-zA-Z_][a-zA-Z0-9_]*$"
    exit 1
  fi
}

stop_internal_postgres() {
  if [[ "$INTERNAL_POSTGRES_STARTED" == "true" ]] && su-exec postgres pg_ctl -D "$INTERNAL_PGDATA" status >/dev/null 2>&1; then
    bashio::log.info "Stopping internal PostgreSQL..."
    su-exec postgres pg_ctl -D "$INTERNAL_PGDATA" -m fast -w stop >/dev/null
  fi
}

cleanup() {
  local exit_code=$?
  set +e

  if [[ "$APP_PID" -gt 0 ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill -TERM "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi

  stop_internal_postgres
  exit "$exit_code"
}

forward_signal() {
  if [[ "$APP_PID" -gt 0 ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill -TERM "$APP_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT
trap forward_signal SIGINT SIGTERM

export TELEGRAM_BOT_TOKEN="$(bashio::config 'telegram_bot_token')"
export OPENROUTER_API_KEY="$(bashio::config 'openrouter_api_key')"
export OPENROUTER_MODEL="$(bashio::config 'openrouter_model')"
export ALERT_CRON_SCHEDULE="$(bashio::config 'alert_cron_schedule')"
export LOG_LEVEL="$(bashio::config 'log_level')"

database_url_option="$(bashio::config 'database_url')"

if bashio::config.true 'use_internal_postgres'; then
  POSTGRES_DB="$(bashio::config 'postgres_db')"
  POSTGRES_USER="$(bashio::config 'postgres_user')"
  POSTGRES_PASSWORD="$(bashio::config 'postgres_password')"
  POSTGRES_PORT="$(bashio::config 'postgres_port')"

  require_identifier "$POSTGRES_DB" "postgres_db"
  require_identifier "$POSTGRES_USER" "postgres_user"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

  mkdir -p "$INTERNAL_PGDATA" /run/postgresql
  chown -R postgres:postgres "$INTERNAL_PGDATA" /run/postgresql
  chmod 700 "$INTERNAL_PGDATA"

  if [[ ! -f "${INTERNAL_PGDATA}/PG_VERSION" ]]; then
    bashio::log.info "Initializing internal PostgreSQL data directory..."
    su-exec postgres initdb -D "$INTERNAL_PGDATA" --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  fi

  if ! su-exec postgres pg_ctl -D "$INTERNAL_PGDATA" status >/dev/null 2>&1; then
    bashio::log.info "Starting internal PostgreSQL..."
    su-exec postgres pg_ctl -D "$INTERNAL_PGDATA" -w start -o "-c listen_addresses=127.0.0.1 -c port=${POSTGRES_PORT}" >/dev/null
    INTERNAL_POSTGRES_STARTED=true
  fi

  escaped_password="${POSTGRES_PASSWORD//\'/\'\'}"

  role_exists="$(su-exec postgres psql -p "$POSTGRES_PORT" -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}';")"
  if [[ "$role_exists" == "1" ]]; then
    su-exec postgres psql -p "$POSTGRES_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${escaped_password}';" >/dev/null
  else
    su-exec postgres psql -p "$POSTGRES_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${escaped_password}';" >/dev/null
  fi

  db_exists="$(su-exec postgres psql -p "$POSTGRES_PORT" -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}';")"
  if [[ "$db_exists" != "1" ]]; then
    su-exec postgres createdb -p "$POSTGRES_PORT" -U postgres -O "$POSTGRES_USER" "$POSTGRES_DB"
  fi

  bashio::log.info "Using internal PostgreSQL (${POSTGRES_DB} on 127.0.0.1:${POSTGRES_PORT})."
else
  if [[ -z "$database_url_option" || "$database_url_option" == "null" ]]; then
    bashio::log.error "database_url is required when use_internal_postgres is false."
    exit 1
  fi
  export DATABASE_URL="$database_url_option"
  bashio::log.info "Using external PostgreSQL from database_url."
fi

cd "$APP_DIR"

if bashio::config.true 'run_migrations'; then
  bashio::log.info "Running database migrations..."
  npm run db:migrate
fi

bashio::log.info "Starting Food Expiration Date Tracker..."
node dist/main.js &
APP_PID=$!
wait "$APP_PID"

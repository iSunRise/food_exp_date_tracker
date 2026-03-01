#!/usr/bin/with-contenv bashio
set -euo pipefail

export TELEGRAM_BOT_TOKEN="$(bashio::config 'telegram_bot_token')"
export DATABASE_URL="$(bashio::config 'database_url')"
export OPENROUTER_API_KEY="$(bashio::config 'openrouter_api_key')"
export OPENROUTER_MODEL="$(bashio::config 'openrouter_model')"
export ALERT_CRON_SCHEDULE="$(bashio::config 'alert_cron_schedule')"
export LOG_LEVEL="$(bashio::config 'log_level')"

cd /app

if bashio::config.true 'run_migrations'; then
  bashio::log.info "Running database migrations..."
  npm run db:migrate
fi

bashio::log.info "Starting Food Expiration Date Tracker..."
exec node dist/main.js

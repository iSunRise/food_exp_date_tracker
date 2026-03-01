# Food Expiration Date Tracker - Home Assistant Add-on

Run this Telegram bot as a Home Assistant add-on on HAOS.

## Install

Replace `YOUR_GITHUB_USERNAME` in the link below with your real GitHub username (or org), then open it:

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Ffood_exp_date_tracker)

After adding the repository:
1. Open the add-on store in Home Assistant.
2. Install **Food Expiration Date Tracker**.
3. Set required options:
   - `telegram_bot_token`
   - `openrouter_api_key`
4. Optional database config:
   - Keep `use_internal_postgres: true` (default) to run PostgreSQL inside the add-on.
   - Or set `use_internal_postgres: false` and provide `database_url` for an external database.
5. Start the add-on.

import * as v from "valibot";

const EnvironmentSchema = v.object({
  TELEGRAM_BOT_TOKEN: v.pipe(v.string(), v.nonEmpty("TELEGRAM_BOT_TOKEN is required")),
  DATABASE_URL: v.pipe(v.string(), v.nonEmpty("DATABASE_URL is required")),
  OPENROUTER_API_KEY: v.pipe(v.string(), v.nonEmpty("OPENROUTER_API_KEY is required")),
  OPENROUTER_MODEL: v.optional(v.string(), "google/gemini-2.0-flash-001"),
  ALERT_CRON_SCHEDULE: v.optional(v.string(), "0 9 * * *"),
  LOG_LEVEL: v.optional(v.picklist(["debug", "info", "warn", "error"]), "info"),
});

export interface Config {
  telegramBotToken: string;
  databaseUrl: string;
  openrouterApiKey: string;
  openrouterModel: string;
  alertCronSchedule: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const parsed = v.parse(EnvironmentSchema, env);

  return {
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    databaseUrl: parsed.DATABASE_URL,
    openrouterApiKey: parsed.OPENROUTER_API_KEY,
    openrouterModel: parsed.OPENROUTER_MODEL,
    alertCronSchedule: parsed.ALERT_CRON_SCHEDULE,
    logLevel: parsed.LOG_LEVEL,
  };
}

export const config = loadConfig();

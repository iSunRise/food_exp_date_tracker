import * as v from "valibot";

const EnvironmentSchema = v.object({
  TELEGRAM_BOT_TOKEN: v.pipe(v.string(), v.nonEmpty("TELEGRAM_BOT_TOKEN is required")),
  DATABASE_URL: v.pipe(v.string(), v.nonEmpty("DATABASE_URL is required")),
  OPENROUTER_API_KEY: v.pipe(v.string(), v.nonEmpty("OPENROUTER_API_KEY is required")),
  OPENROUTER_MODEL: v.optional(v.string(), "google/gemini-2.0-flash-001"),
  S3_BUCKET: v.pipe(v.string(), v.nonEmpty("S3_BUCKET is required")),
  S3_REGION: v.optional(v.string(), "us-east-1"),
  S3_ENDPOINT: v.optional(v.string()),
  S3_ACCESS_KEY_ID: v.pipe(v.string(), v.nonEmpty("S3_ACCESS_KEY_ID is required")),
  S3_SECRET_ACCESS_KEY: v.pipe(v.string(), v.nonEmpty("S3_SECRET_ACCESS_KEY is required")),
  S3_FORCE_PATH_STYLE: v.optional(v.string(), "false"),
  ALERT_CRON_SCHEDULE: v.optional(v.string(), "0 9 * * *"),
  LOG_LEVEL: v.optional(v.picklist(["debug", "info", "warn", "error"]), "info"),
});

export interface Config {
  telegramBotToken: string;
  databaseUrl: string;
  openrouterApiKey: string;
  openrouterModel: string;
  s3Bucket: string;
  s3Region: string;
  s3Endpoint?: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3ForcePathStyle: boolean;
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
    s3Bucket: parsed.S3_BUCKET,
    s3Region: parsed.S3_REGION,
    s3Endpoint: parsed.S3_ENDPOINT,
    s3AccessKeyId: parsed.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
    s3ForcePathStyle: parsed.S3_FORCE_PATH_STYLE === "true",
    alertCronSchedule: parsed.ALERT_CRON_SCHEDULE,
    logLevel: parsed.LOG_LEVEL,
  };
}

export const config = loadConfig();

import { sql } from "drizzle-orm";

import { TelegramAdapter } from "./adapters/telegram.js";
import { BotEngine } from "./bot/engine.js";
import { createDefaultHandlers } from "./bot/handlers/index.js";
import { config } from "./config.js";
import { S3ImageStorageService } from "./image-storage/client.js";
import { DefaultI18nService } from "./i18n/index.js";
import { OpenRouterLlmClient } from "./llm/client.js";
import { DefaultVisionService } from "./ocr/vision.js";
import { AlertScheduler } from "./scheduler/alerts.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "./storage/database.js";
import { DrizzleFoodRepository } from "./storage/repository.js";

let dbConnection: DatabaseConnection | null = null;
let adapter: TelegramAdapter | null = null;
let scheduler: AlertScheduler | null = null;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  console.log(`[${config.logLevel}] Food Expiration Date Tracker starting...`);

  // Database
  dbConnection = createDatabaseConnection(config.databaseUrl);
  await dbConnection.db.execute(sql`select 1`);
  console.log("Database connected.");

  // Core services
  const repository = new DrizzleFoodRepository(dbConnection.db);
  const i18n = new DefaultI18nService(repository);
  const llmClient = new OpenRouterLlmClient({
    apiKey: config.openrouterApiKey,
    model: config.openrouterModel,
  });
  const vision = new DefaultVisionService(llmClient);
  const imageStorage = new S3ImageStorageService({
    bucket: config.s3Bucket,
    region: config.s3Region,
    endpoint: config.s3Endpoint,
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    forcePathStyle: config.s3ForcePathStyle,
  });

  // Telegram adapter
  adapter = new TelegramAdapter({ token: config.telegramBotToken });

  // Bot engine
  const engine = new BotEngine({
    adapter,
    vision,
    repository,
    i18n,
    imageStorage,
    handlers: createDefaultHandlers(),
  });
  engine.start();
  console.log("Bot engine started.");

  // Scheduler
  scheduler = new AlertScheduler(
    repository,
    adapter,
    i18n,
    config.alertCronSchedule,
  );
  scheduler.start();
  console.log(`Alert scheduler started (cron: ${config.alertCronSchedule}).`);

  // Telegram polling (starts last)
  await adapter.start();
  console.log("Bot is running. Press Ctrl+C to stop.");
}

async function shutdown(signal?: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Shutting down${signal ? ` (${signal})` : ""}...`);

  if (scheduler) {
    scheduler.stop();
    console.log("Scheduler stopped.");
  }

  if (adapter) {
    await adapter.stop();
    console.log("Telegram adapter stopped.");
  }

  if (dbConnection) {
    await dbConnection.close();
    console.log("Database connection closed.");
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});

void bootstrap().catch(async (error) => {
  console.error("Failed to start application.", error);
  await shutdown();
  process.exit(1);
});

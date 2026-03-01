# Module: Infrastructure & Setup

## Scope

Project scaffolding, Docker configuration, environment config, shared types and interfaces that all other modules depend on.

## Files

| File                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `package.json`        | Dependencies, scripts                        |
| `tsconfig.json`       | TypeScript config (ESM, strict, path aliases) |
| `vitest.config.ts`    | Test runner config                           |
| `drizzle.config.ts`   | Drizzle Kit migration config                 |
| `Dockerfile`          | Multi-stage build for the bot service        |
| `docker-compose.yml`  | PostgreSQL + bot service orchestration        |
| `.env.example`        | Template for required environment variables   |
| `src/config.ts`       | Valibot-validated environment configuration   |
| `src/shared/interfaces.ts` | All cross-module interfaces              |
| `src/shared/schemas.ts`    | All cross-module valibot schemas         |
| `src/shared/types.ts`      | Inferred types from valibot schemas      |
| `src/main.ts`         | Entrypoint — wires all modules (implemented last) |

## Dependencies

```
# Runtime
grammy
drizzle-orm
pg
openai
node-cron
valibot

# Dev
typescript
vitest
drizzle-kit
@types/pg
@types/node
tsx               # For development execution
```

## Docker Compose Services

### `db` — PostgreSQL 16

- Image: `postgres:16-alpine`
- Port: 5432 mapped to host
- Named volume for data persistence
- Health check on `pg_isready`

### `bot` — Application

- Built from Dockerfile
- Depends on `db` (healthy)
- Mounts `.env` for config
- Runs `tsx src/main.ts` in dev (or compiled JS in prod)

## Dockerfile

- Multi-stage: `build` stage compiles TS → JS, `runtime` stage copies only compiled output + node_modules
- Base image: `node:22-alpine`
- Non-root user for runtime

## Environment Variables

| Variable              | Required | Description                              |
| --------------------- | -------- | ---------------------------------------- |
| `TELEGRAM_BOT_TOKEN`  | Yes      | From BotFather                           |
| `DATABASE_URL`        | Yes      | PostgreSQL connection string              |
| `OPENROUTER_API_KEY`  | Yes      | OpenRouter API key                        |
| `OPENROUTER_MODEL`    | No       | Model ID (default: `google/gemini-2.0-flash-001`) |
| `ALERT_CRON_SCHEDULE` | No       | Cron expression (default: `0 9 * * *` — daily 9 AM) |
| `LOG_LEVEL`           | No       | `debug` / `info` / `warn` / `error` (default: `info`) |

## src/config.ts

- Uses valibot to define and parse all env vars
- Exports a single `config` object
- Fails fast on startup if required vars are missing
- Each module receives only the config slice it needs (passed via constructor/factory)

## src/shared/interfaces.ts

This is the critical file that enables parallel development. All module boundaries are defined here as TypeScript interfaces.

```typescript
// === Adapter Interface ===

interface BotAdapter {
  onMessage(handler: MessageHandler): void
  onCallbackQuery(handler: CallbackQueryHandler): void
  sendMessage(chatId: string, message: OutgoingMessage): Promise<void>
  sendAlert(chatId: string, alert: AlertPayload): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

// === Vision Service Interface ===

interface VisionService {
  extractExpiryDate(image: Buffer, mimeType: string): Promise<ExtractionResult>
}

// === LLM Client Interface ===

interface LlmClient {
  chatCompletion(params: LlmCompletionParams): Promise<LlmCompletionResult>
  visionCompletion(params: LlmVisionParams): Promise<LlmCompletionResult>
}

// === Food Repository Interface ===

interface FoodRepository {
  addItem(item: NewFoodItem): Promise<FoodItem>
  getActiveItems(chatId: string): Promise<FoodItem[]>
  getItemById(id: string): Promise<FoodItem | null>
  markConsumed(id: string): Promise<void>
  deleteItem(id: string): Promise<void>
  getItemsExpiringBetween(from: Date, to: Date): Promise<FoodItem[]>
  recordAlertSent(itemId: string, daysBeforeExpiry: number): Promise<void>
  getUnalertedItemsForDay(targetDate: Date, daysBeforeExpiry: number): Promise<FoodItem[]>
  getLocale(chatId: string): Promise<string>
  setLocale(chatId: string, locale: string): Promise<void>
}

// === i18n Service Interface ===

type Locale = 'en' | 'uk'

interface I18nService {
  t(chatId: string, key: string, params?: Record<string, unknown>): string
  setLocale(chatId: string, locale: Locale): Promise<void>
  getLocale(chatId: string): Promise<Locale>
}
```

## src/shared/schemas.ts

Valibot schemas for all data that crosses module boundaries:

- `IncomingMessageSchema` — what adapter sends to engine (text, photo, callback)
- `OutgoingMessageSchema` — what engine sends back through adapter
- `ExtractionResultSchema` — vision service output (product name, expiry date, confidence)
- `AlertPayloadSchema` — what scheduler sends through adapter
- `FoodItemSchema` — domain entity
- `NewFoodItemSchema` — creation DTO

## src/shared/types.ts

TypeScript types inferred from valibot schemas using `InferOutput<>`. Single source of truth — schemas define shape, types are derived.

## src/main.ts (implemented last — Phase 4)

- Loads config
- Creates database connection
- Instantiates each module, injecting dependencies
- Starts adapter and scheduler
- Handles graceful shutdown (SIGTERM/SIGINT → stop scheduler, stop adapter, close DB pool)

## npm Scripts

| Script             | Command                                      |
| ------------------ | -------------------------------------------- |
| `dev`              | `tsx watch src/main.ts`                      |
| `build`            | `tsc`                                        |
| `start`            | `node dist/main.js`                          |
| `test`             | `vitest run`                                 |
| `test:watch`       | `vitest`                                     |
| `db:generate`      | `drizzle-kit generate`                       |
| `db:migrate`       | `drizzle-kit migrate`                        |
| `db:studio`        | `drizzle-kit studio`                         |
| `docker:up`        | `docker compose up -d`                       |
| `docker:down`      | `docker compose down`                        |

## Tasks

1. Initialize `package.json`, install all dependencies
2. Configure `tsconfig.json` (ESM, strict, paths aliases `@/` → `src/`)
3. Configure `vitest.config.ts`
4. Write `src/shared/interfaces.ts` — all interfaces
5. Write `src/shared/schemas.ts` — all valibot schemas
6. Write `src/shared/types.ts` — inferred types
7. Write `src/config.ts` — env validation
8. Write `.env.example`
9. Write `docker-compose.yml`
10. Write `Dockerfile`
11. Write `drizzle.config.ts`
12. Verify `docker compose up` starts PostgreSQL and bot container connects

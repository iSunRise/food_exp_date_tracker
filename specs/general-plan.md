# Food Expiration Date Tracker Bot — General Plan

## Overview

A Telegram bot that helps users track food expiration dates. Users send photos of food labels; the bot extracts expiration dates using a vision-capable LLM via OpenRouter, stores them, and sends alerts as expiration approaches. Users can dismiss alerts by marking items as consumed. Supports English and Ukrainian languages — user selects language on first interaction or via `/lang` command.

## Tech Stack

| Concern           | Choice                          | Notes                                                        |
| ----------------- | ------------------------------- | ------------------------------------------------------------ |
| Runtime           | Node.js 22 + TypeScript 5.x    | ESM throughout                                               |
| Telegram          | grammY                          | TS-first, clean middleware system                            |
| Database          | Drizzle ORM + pg driver         | Lightweight, SQL-close, built-in migrations                  |
| LLM               | OpenAI SDK (OpenAI-compatible)  | OpenRouter exposes OpenAI-compatible API                     |
| Scheduler         | node-cron                       | In-process, sufficient for periodic checks                   |
| Validation        | valibot                         | Tree-shakeable, function-based schemas as module contracts   |
| Testing           | vitest                          | Fast, native TS, ESM-friendly                                |
| Containerization  | Docker Compose                  | PostgreSQL + bot service                                     |

## Architecture Diagram

```
┌─────────────┐         ┌──────────────┐
│  Telegram    │◄───────►│  Telegram    │
│  User        │         │  Adapter     │
└─────────────┘         └──────┬───────┘
                               │ BotAdapter interface
                        ┌──────▼───────┐
                        │  Bot Engine   │
                        │ (orchestrator)│
                        └──┬───┬───┬───┘
                           │   │   │
              ┌────────────┘   │   └────────────┐
              │                │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼──────┐
       │  OCR/Vision  │ │  Storage    │ │  Scheduler   │
       │  Service     │ │  (Repo)     │ │  (Alerts)    │
       └──────┬───────┘ └──────┬──────┘ └──────────────┘
              │                │
       ┌──────▼──────┐ ┌──────▼──────┐   ┌────────────┐
       │  LLM Client │ │  PostgreSQL │   │    i18n     │
       │ (OpenRouter) │ │             │   │  (en / uk)  │
       └─────────────┘ └─────────────┘   └────────────┘

i18n is used by Bot Engine and Scheduler for all user-facing text.
```

## Module Boundaries

Each module communicates through explicitly defined interfaces and valibot schemas. No module imports another module's internal dependencies.

### Dependency Rules

- **Telegram Adapter** → implements `BotAdapter` interface; depends on grammY only
- **Bot Engine** → depends on `BotAdapter`, `FoodRepository`, `VisionService`, `I18nService` interfaces only
- **OCR/Vision** → depends on `LlmClient` interface only
- **LLM Client** → depends on OpenAI SDK only; no knowledge of OCR or bot logic
- **Storage** → depends on Drizzle ORM only; exposes `FoodRepository` interface
- **Scheduler** → depends on `FoodRepository`, `BotAdapter`, and `I18nService` interfaces only
- **i18n** → depends on `FoodRepository` for locale persistence; no other module dependencies

### Shared Types (src/shared/)

All cross-module data types and valibot schemas live in `src/shared/`. Modules import types from here — never from each other.

## Project Structure

```
food_exp_date_tracker/
├── specs/                          # This folder — planning documents
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── drizzle/                        # Generated migration files
├── src/
│   ├── main.ts                     # Entrypoint: wires all modules together
│   ├── config.ts                   # Valibot-validated environment config
│   ├── shared/
│   │   ├── interfaces.ts           # All cross-module interfaces (BotAdapter, FoodRepository, etc.)
│   │   ├── schemas.ts              # Valibot schemas for cross-module DTOs
│   │   └── types.ts                # Inferred types from valibot schemas
│   ├── i18n/
│   │   ├── index.ts                # I18nService implementation
│   │   └── locales/
│   │       ├── en.ts               # English translations
│   │       └── uk.ts               # Ukrainian translations
│   ├── bot/
│   │   └── engine.ts               # Command routing, orchestration logic
│   ├── adapters/
│   │   └── telegram.ts             # grammY-based BotAdapter implementation
│   ├── ocr/
│   │   └── vision.ts               # Image → structured expiry data
│   ├── llm/
│   │   └── client.ts               # OpenRouter via OpenAI SDK
│   ├── storage/
│   │   ├── schema.ts               # Drizzle table definitions
│   │   ├── repository.ts           # FoodRepository implementation
│   │   └── database.ts             # Connection pool, Drizzle instance
│   └── scheduler/
│       └── alerts.ts               # Periodic check job + notification dispatch
└── tests/
    ├── i18n/
    │   └── index.test.ts
    ├── bot/
    │   └── engine.test.ts
    ├── adapters/
    │   └── telegram.test.ts
    ├── ocr/
    │   └── vision.test.ts
    ├── llm/
    │   └── client.test.ts
    ├── storage/
    │   └── repository.test.ts
    └── scheduler/
        └── alerts.test.ts
```

## User Flows

### Flow 0: Language Selection

1. On first interaction (`/start`), bot greets in English and prompts language selection with inline buttons: "English" / "Українська"
2. User taps a button
3. Engine calls `I18nService.setLocale(chatId, locale)` — persisted in `user_preferences` table
4. Bot confirms in the selected language
5. User can change language later via `/lang` command (same flow)

### Flow 1: Add Food Item via Photo

1. User sends a photo to the bot
2. Telegram Adapter receives the photo, downloads it as a buffer, wraps it in `IncomingMessage`
3. Bot Engine receives `IncomingMessage`, detects it contains an image
4. Engine calls `VisionService.extractExpiryDate(imageBuffer)`
5. VisionService sends image to LLM Client with a structured prompt
6. LLM Client calls OpenRouter vision model, returns raw response
7. VisionService parses response into `ExtractionResult` (product name, expiry date, confidence)
8. If confidence is low or ambiguous, Engine asks user for confirmation via adapter
9. Engine calls `FoodRepository.addItem(...)` to persist
10. Engine replies to user with confirmation via adapter

### Flow 2: List Tracked Items

1. User sends `/list` command
2. Engine calls `FoodRepository.getActiveItems(chatId)`
3. Engine formats items into a message with inline keyboard buttons (consume/delete)
4. Adapter sends formatted message

### Flow 3: Expiry Alert

1. Scheduler runs periodically (e.g., every hour)
2. Queries `FoodRepository.getItemsExpiringInDays([1, 2, 3])`
3. Filters out items already alerted for that day
4. For each item, calls `BotAdapter.sendAlert(chatId, alertPayload)`
5. Records that alert was sent (prevents duplicate alerts)

### Flow 4: Mark as Consumed

1. User taps "Consumed" button on an alert or list item
2. Adapter receives callback, wraps as `IncomingMessage` with action type
3. Engine calls `FoodRepository.markConsumed(itemId)`
4. Engine replies with confirmation

## Implementation Order

Modules can be developed **simultaneously** since interfaces are defined upfront. However, integration follows this order:

1. **Phase 1 (parallel)**:
   - Infrastructure (Docker, config, project scaffolding)
   - Storage module (schema, migrations, repository)
   - LLM Client module
2. **Phase 2 (parallel, after Phase 1 interfaces exist)**:
   - OCR/Vision module (needs LLM Client)
   - Telegram Adapter (needs shared interfaces)
   - Scheduler (needs Storage + Adapter interfaces)
   - i18n module (needs Storage for locale persistence)
3. **Phase 3**:
   - Bot Engine (wires everything together)
   - Integration testing
4. **Phase 4**:
   - main.ts entrypoint (DI wiring)
   - End-to-end testing with Docker Compose

## Detailed Module Specs

Each module has its own spec document:

- [Infrastructure & Setup](./module-infrastructure.md)
- [Storage](./module-storage.md)
- [LLM Client](./module-llm-client.md)
- [OCR/Vision](./module-ocr-vision.md)
- [Bot Engine](./module-bot-engine.md)
- [Telegram Adapter](./module-telegram-adapter.md)
- [Scheduler](./module-scheduler.md)
- [i18n](./module-i18n.md)

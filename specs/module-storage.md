# Module: Storage

## Scope

PostgreSQL database schema, Drizzle ORM setup, connection management, and the `FoodRepository` implementation.

## Files

| File                          | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `src/storage/schema.ts`       | Drizzle table definitions            |
| `src/storage/database.ts`     | Connection pool, Drizzle instance    |
| `src/storage/repository.ts`   | `FoodRepository` implementation      |
| `drizzle/`                    | Generated migration SQL files        |
| `tests/storage/repository.test.ts` | Repository tests               |

## Dependencies

- `drizzle-orm` — ORM
- `pg` — PostgreSQL driver
- `drizzle-kit` — migration generation (dev)
- Receives `DATABASE_URL` from config

## Database Schema

### Table: `food_items`

| Column         | Type                     | Constraints                     |
| -------------- | ------------------------ | ------------------------------- |
| `id`           | `uuid`                   | PK, default `gen_random_uuid()` |
| `chat_id`      | `varchar(64)`            | NOT NULL, indexed               |
| `product_name` | `varchar(255)`           | NOT NULL                        |
| `expiry_date`  | `date`                   | NOT NULL, indexed               |
| `image_url`    | `text`                   | Nullable — Telegram file ID or URL for reference |
| `status`       | `varchar(20)`            | NOT NULL, default `'active'`. Values: `active`, `consumed`, `expired`, `deleted` |
| `confidence`   | `real`                   | Nullable — LLM extraction confidence score |
| `created_at`   | `timestamp with tz`      | NOT NULL, default `now()`       |
| `updated_at`   | `timestamp with tz`      | NOT NULL, default `now()`       |

### Table: `alerts_sent`

Tracks which alerts have been sent to prevent duplicates.

| Column              | Type                 | Constraints                       |
| ------------------- | -------------------- | --------------------------------- |
| `id`                | `uuid`               | PK, default `gen_random_uuid()`   |
| `food_item_id`      | `uuid`               | FK → `food_items.id`, NOT NULL    |
| `days_before_expiry`| `integer`            | NOT NULL (3, 2, or 1)             |
| `sent_at`           | `timestamp with tz`  | NOT NULL, default `now()`         |

- Unique constraint on `(food_item_id, days_before_expiry)` — one alert per threshold per item

### Table: `user_preferences`

Stores per-user settings, primarily language preference.

| Column     | Type           | Constraints               |
| ---------- | -------------- | ------------------------- |
| `chat_id`  | `varchar(64)`  | PK                        |
| `locale`   | `varchar(5)`   | NOT NULL, default `'en'`  |

### Indexes

- `food_items(chat_id)` — fast lookup of user's items
- `food_items(expiry_date)` WHERE `status = 'active'` — partial index for scheduler queries
- `alerts_sent(food_item_id)` — fast join for "unalerted" queries

## src/storage/database.ts

- Creates a `pg.Pool` with the connection string from config
- Creates and exports the Drizzle instance
- Exports a `close()` function for graceful shutdown

## src/storage/repository.ts

Implements `FoodRepository` interface from `src/shared/interfaces.ts`.

### Method Details

**`addItem(item: NewFoodItem): Promise<FoodItem>`**
- Inserts into `food_items`, returns the created row

**`getActiveItems(chatId: string): Promise<FoodItem[]>`**
- Selects all items where `chat_id = chatId` AND `status = 'active'`
- Ordered by `expiry_date` ASC (soonest first)

**`getItemById(id: string): Promise<FoodItem | null>`**
- Simple PK lookup

**`markConsumed(id: string): Promise<void>`**
- Updates `status` to `'consumed'` and `updated_at` to `now()`

**`deleteItem(id: string): Promise<void>`**
- Updates `status` to `'deleted'` and `updated_at` to `now()` (soft delete)

**`getItemsExpiringBetween(from: Date, to: Date): Promise<FoodItem[]>`**
- Selects active items where `expiry_date` BETWEEN `from` AND `to`

**`getUnalertedItemsForDay(targetDate: Date, daysBeforeExpiry: number): Promise<FoodItem[]>`**
- Selects active items whose `expiry_date = targetDate`
- LEFT JOINs `alerts_sent` to exclude items already alerted for that `daysBeforeExpiry` value
- This is the primary query used by the scheduler

**`recordAlertSent(itemId: string, daysBeforeExpiry: number): Promise<void>`**
- Inserts into `alerts_sent`
- Uses ON CONFLICT DO NOTHING (idempotent)

**`getLocale(chatId: string): Promise<string>`**
- Returns the locale for the chat, or `'en'` if not set

**`setLocale(chatId: string, locale: string): Promise<void>`**
- Upserts into `user_preferences` (INSERT ... ON CONFLICT UPDATE)

## Testing Strategy

- Tests run against a real PostgreSQL instance (via Docker Compose test service or testcontainers)
- Each test uses a transaction that is rolled back after the test (clean state)
- Test cases:
  - CRUD operations on food items
  - Status transitions (active → consumed, active → deleted)
  - `getUnalertedItemsForDay` correctly excludes already-alerted items
  - `getActiveItems` ordering by expiry date
  - Duplicate alert prevention via unique constraint

## Tasks

1. Define Drizzle table schemas in `src/storage/schema.ts`
2. Generate initial migration with `drizzle-kit generate`
3. Implement `database.ts` — pool creation, Drizzle instance, close function
4. Implement `FoodRepository` in `repository.ts`
5. Write tests for all repository methods
6. Verify migrations apply cleanly on fresh database

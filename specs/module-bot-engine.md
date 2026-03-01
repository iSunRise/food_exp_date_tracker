# Module: Bot Engine

## Scope

The central orchestrator. Receives adapter-agnostic messages, validates them, and dispatches to pluggable handlers. The engine itself is a thin router — all command logic, callback processing, and photo handling live in individual handler files. Knows nothing about Telegram/grammY, OpenAI SDK, or Drizzle — only works with interfaces.

## Architecture

The bot engine follows a **handler chain** pattern:

1. The **engine** (`src/bot/engine.ts`) validates incoming messages and iterates through an ordered list of handlers. The first handler whose `match()` returns `true` processes the message.
2. Each **handler** (`src/bot/handlers/*.ts`) is a self-contained unit that declares what it matches and how to process it, conforming to the `BotHandler` interface defined in `src/bot/handler.ts`.
3. A **handler context** (`HandlerContext`) provides every handler with access to all dependencies (adapter, vision, repository, i18n) and shared utilities.
4. A **factory function** (`createDefaultHandlers()` in `src/bot/handlers/index.ts`) wires handler ordering and shared state, returning the complete handler array.

Adding a new command or callback requires only creating a new handler file and registering it in the factory — no engine modifications needed.

## Files

| File | Purpose |
| --- | --- |
| `src/bot/engine.ts` | Thin router: validates messages, iterates handlers |
| `src/bot/handler.ts` | `BotHandler` and `HandlerContext` interface definitions |
| `src/bot/utils.ts` | Shared constants and utility functions |
| `src/bot/handlers/index.ts` | `createDefaultHandlers()` factory — wires ordering and shared state |
| `src/bot/handlers/start.ts` | `/start` command handler |
| `src/bot/handlers/help.ts` | `/help` command handler |
| `src/bot/handlers/list.ts` | `/list` command handler |
| `src/bot/handlers/lang.ts` | `/lang` command handler + `lang:{locale}` callback handler |
| `src/bot/handlers/photo.ts` | Photo message processing with vision service |
| `src/bot/handlers/confirmation.ts` | `ConfirmationStore` class + pending confirmation text interceptor |
| `src/bot/handlers/consume.ts` | `consume:{id}` callback handler |
| `src/bot/handlers/delete.ts` | `delete:{id}` callback handler |
| `src/bot/handlers/fallback.ts` | Catch-all handler for unrecognized messages |
| `tests/bot/engine.test.ts` | Integration tests with all dependencies mocked |

## Dependencies (all injected)

- `BotAdapter` interface
- `VisionService` interface
- `FoodRepository` interface
- `I18nService` interface
- `valibot` — for validating incoming message payloads

## Interfaces

### `BotHandler` (defined in `src/bot/handler.ts`)

Every handler implements this interface:

- `name: string` — human-readable identifier for logging/debugging
- `match(message: IncomingMessage): boolean` — returns `true` if this handler should process the message
- `handle(message: IncomingMessage, ctx: HandlerContext): Promise<void>` — processes the matched message

### `HandlerContext` (defined in `src/bot/handler.ts`)

Passed to every handler's `handle()` method. Provides:

- `adapter: BotAdapter` — for sending messages
- `vision: VisionService` — for image extraction
- `repository: FoodRepository` — for data persistence
- `i18n: I18nService` — for translations
- `sendLocalized(chatId, key, options?)` — convenience method that translates via `i18n.t()` and sends via `adapter.sendMessage()` in one call. Accepts optional `params` and `inlineKeyboard`.

The engine creates a single `HandlerContext` instance in its constructor and passes it to all handlers.

## src/bot/engine.ts

### Constructor (`BotEngineOptions`)

Receives all dependencies plus the handler array via a single options object:

- `adapter: BotAdapter`
- `vision: VisionService`
- `repository: FoodRepository`
- `i18n: I18nService`
- `handlers: BotHandler[]`

Builds the `HandlerContext` from the provided dependencies.

### Method: `start(): void`

Registers listeners on the adapter:
- `adapter.onMessage(handler)` — for text and photo messages
- `adapter.onCallbackQuery(handler)` — for inline button taps

Both listeners delegate to the same `route()` method.

### Method: `route(raw: IncomingMessage)` (private)

1. Validates the incoming message against `IncomingMessageSchema` via valibot. Silently drops invalid messages.
2. Iterates through `this.handlers` in order. The first handler whose `match()` returns `true` has its `handle()` called.
3. If no handler matches, sends `unknownCommand` via `sendLocalized`.
4. Wraps the entire dispatch in a try/catch — errors fall back to `unknownCommand`.

## src/bot/utils.ts

Shared constants and pure utility functions used across handlers:

### Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `LOW_CONFIDENCE_THRESHOLD` | `0.7` | Below this, photo extraction requires user confirmation |
| `CONFIRMATION_TTL_MS` | `300000` (5 min) | Timeout for pending confirmations |
| `DEFAULT_LOCALE` | `"en"` | Fallback locale |
| `SUPPORTED_LOCALES` | `["en", "uk"]` | Valid locale values |
| `YES_TOKENS` | `Set{"yes", "y", "tak", "так", "да"}` | Accepted affirmative responses |
| `NO_TOKENS` | `Set{"no", "n", "ni", "ні", "нет"}` | Accepted negative responses |

### Functions

- `extractId(value, prefix)` — strips a prefix from callback data and returns the ID portion, or `null`
- `computeDaysUntil(expiryDate)` — calculates days from today to the given ISO date string
- `buildLanguageKeyboard()` — returns the standard language selection `InlineButton[][]`
- `isSupportedLocale(locale)` — type guard that checks if a string is a valid `Locale`

## Handler Registration Order

Defined in `createDefaultHandlers()` in `src/bot/handlers/index.ts`. Order matters — first match wins.

| Priority | Handler(s) | Match Criteria |
| --- | --- | --- |
| 1 | `consumeHandler`, `deleteHandler`, `langSelectionHandler` | `type === "callback"` + callbackData prefix |
| 2 | confirmation handler | `type === "text"` + pending confirmation exists for chatId |
| 3 | photo handler | `type === "photo"` |
| 4 | `startHandler`, `helpHandler`, `listHandler`, `langCommandHandler` | `type === "text"` + exact command match |
| 5 | `fallbackHandler` | Always returns `true` (catch-all, must be last) |

**Ordering rationale:**
- Callback handlers first — they match on `type === "callback"` and are mutually exclusive with text/photo handlers.
- Confirmation handler before commands — when a pending confirmation exists, text input like "yes" must be intercepted before command matching.
- Photo before text commands — `type === "photo"` is disjoint from text commands.
- Fallback last — catches anything unhandled.

## Handlers

### `/start` — `src/bot/handlers/start.ts`

- Checks if user has a persisted locale via `repository.getLocale(chatId)` + `isSupportedLocale()`
- First interaction (no locale): replies with welcome + language selection prompt with inline keyboard
- Returning user (locale set): replies with welcome + help text

### `/help` — `src/bot/handlers/help.ts`

- Replies with the `help` i18n key via `sendLocalized`

### `/list` — `src/bot/handlers/list.ts`

1. Calls `repository.getActiveItems(chatId)`
2. If no items: replies with `noActiveItems`
3. Formats each item using `i18n.t(chatId, "listItem", ...)` with `computeDaysUntil()`
4. Builds inline keyboard with "Consume" and "Delete" buttons per item (callback data: `consume:{id}`, `delete:{id}`)
5. Sends header + formatted lines + inline keyboard via `adapter.sendMessage()`

### `/lang` + `lang:{locale}` — `src/bot/handlers/lang.ts`

Exports two handlers:

- **`langCommandHandler`**: replies with `selectLanguage` text + language selection inline keyboard
- **`langSelectionHandler`**: extracts locale from `lang:{locale}` callback, validates it, calls `i18n.setLocale()`, replies with `languageChanged`

### Photo — `src/bot/handlers/photo.ts`

Factory function `createPhotoHandler(confirmationStore)` — receives the shared `ConfirmationStore` instance.

1. Validates `imageBuffer` and `imageMimeType` are present
2. Sends `analyzingPhoto` immediate feedback
3. Calls `vision.extractExpiryDate(imageBuffer, imageMimeType)`
4. If extraction failed: replies with `extractionFailed`
5. If no date found: replies with `noDateFound`
6. Determines `productName` from extraction (falls back to rawDateText, then expiryDate)
7. If confidence < `LOW_CONFIDENCE_THRESHOLD`: stores pending confirmation in `ConfirmationStore`, replies with `confirmExtraction`
8. If confidence >= threshold: saves via `repository.addItem()`, replies with `itemAdded`

### Confirmation — `src/bot/handlers/confirmation.ts`

Exports `ConfirmationStore` class and `createConfirmationHandler(store)` factory.

**`ConfirmationStore`** manages in-memory pending confirmations (`Map<string, PendingConfirmation>`):
- `has(chatId)` / `get(chatId)` / `clear(chatId)`
- `set(chatId, payload)` — clears any existing confirmation for that chatId, sets a new one with an auto-expiry timeout (`CONFIRMATION_TTL_MS`)

**Confirmation handler** (`match`: text message + `store.has(chatId)`):
1. Normalizes text input to lowercase
2. If yes token: clears confirmation, saves item via `repository.addItem()`, replies with `itemAdded`
3. If no token: clears confirmation, replies with `extractionFailed`
4. Otherwise: re-prompts with `confirmExtraction` (same data)

The `ConfirmationStore` is instantiated once in `createDefaultHandlers()` and shared between the photo handler and confirmation handler via closure.

### `consume:{id}` — `src/bot/handlers/consume.ts`

1. Extracts `itemId` from callback data via `extractId()`
2. Fetches item via `repository.getItemById()`
3. Calls `repository.markConsumed(itemId)`
4. Replies with `itemConsumed` including product name

### `delete:{id}` — `src/bot/handlers/delete.ts`

1. Extracts `itemId` from callback data via `extractId()`
2. Fetches item via `repository.getItemById()`
3. Calls `repository.deleteItem(itemId)`
4. Replies with `itemDeleted` including product name

### Fallback — `src/bot/handlers/fallback.ts`

- `match()` always returns `true`
- Replies with `unknownCommand` via `sendLocalized`
- Must be registered last in the handler array

## i18n Usage

All user-facing strings go through `i18n.t(chatId, key, params)`. No handler contains hardcoded user-facing text. Most handlers use the `ctx.sendLocalized()` convenience method. Handlers that compose multiple translated strings (e.g., start, list) call `ctx.i18n.t()` directly and then `ctx.adapter.sendMessage()`.

## Conversation State

For the low-confidence confirmation flow, the `ConfirmationStore` class manages in-memory state:

- A `Map<string, PendingConfirmation>` keyed by `chatId`
- When awaiting confirmation, the confirmation handler intercepts the next text message from that chat (checked via `store.has(chatId)`)
- Pending confirmations expire after 5 minutes via `setTimeout`
- This is in-memory only — acceptable for a single-instance bot
- The store is shared between the photo handler (writes) and confirmation handler (reads/clears) via dependency injection in `createDefaultHandlers()`

## Extending the Bot

To add a new command (e.g., `/stats`):

1. Create `src/bot/handlers/stats.ts` implementing the `BotHandler` interface
2. Import it in `src/bot/handlers/index.ts` and add it to the array before `fallbackHandler`

No changes needed to the engine, other handlers, or tests of other handlers.

## Testing Strategy

- All dependencies (adapter, vision, repository, i18n) are mocked via a shared harness
- Integration tests in `tests/bot/engine.test.ts` verify the full routing chain using `createDefaultHandlers()`
- Tests call `engine.start()`, then invoke the captured message/callback handlers directly
- Coverage includes: all commands, photo processing (high/low confidence), confirmation flow (yes/no/timeout), all callback actions, unknown messages, error paths

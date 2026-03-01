# Module: Bot Engine

## Scope

The central orchestrator. Receives adapter-agnostic messages, routes them to the appropriate handler, coordinates between vision service and storage, and returns responses through the adapter. Knows nothing about Telegram/grammY, OpenAI SDK, or Drizzle — only works with interfaces.

## Files

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `src/bot/engine.ts`          | Core orchestration and command handling  |
| `tests/bot/engine.test.ts`   | Unit tests with all dependencies mocked  |

## Dependencies (all injected)

- `BotAdapter` interface
- `VisionService` interface
- `FoodRepository` interface
- `I18nService` interface
- `valibot` — for validating incoming message payloads

## src/bot/engine.ts

### Constructor

Receives all dependencies via a single options object:
- `adapter: BotAdapter`
- `vision: VisionService`
- `repository: FoodRepository`
- `i18n: I18nService`

### Method: `start(): void`

Registers handlers on the adapter:
- `adapter.onMessage(handler)` — for text and photo messages
- `adapter.onCallbackQuery(handler)` — for inline button taps

### Message Routing

When a message is received, the engine inspects its type and routes:

| Message Type      | Handler                     |
| ----------------- | --------------------------- |
| Photo (has image) | `handlePhotoMessage`        |
| `/start`          | `handleStartCommand`        |
| `/list`           | `handleListCommand`         |
| `/help`           | `handleHelpCommand`         |
| `/lang`           | `handleLangCommand`         |
| Callback: `consume:{id}` | `handleConsumeAction` |
| Callback: `delete:{id}`  | `handleDeleteAction`  |
| Callback: `lang:{locale}` | `handleLangSelection` |
| Unknown text      | `handleUnknownMessage`      |

### Handler: `handleStartCommand(msg: IncomingMessage)`

- Checks if user has a locale set (via `i18n.getLocale(chatId)`)
- If first interaction (no locale persisted): replies with welcome message in English and prompts language selection with inline buttons: "English 🇬🇧" / "Українська 🇺🇦" (callback data: `lang:en`, `lang:uk`)
- If locale already set: replies with welcome message in user's language, lists available commands

### Handler: `handleHelpCommand(msg: IncomingMessage)`

- Replies with usage instructions

### Handler: `handlePhotoMessage(msg: IncomingMessage)`

1. Extract image buffer and mimeType from the message
2. Reply with "Analyzing your food label..." (immediate feedback)
3. Call `vision.extractExpiryDate(image, mimeType)`
4. If extraction failed → reply with error, suggest retaking photo
5. If extraction succeeded but low confidence (< 0.7) → ask user to confirm the extracted date (include raw text and parsed date)
6. If extraction succeeded with high confidence → save immediately via `repository.addItem(...)` and reply with confirmation showing product name and expiry date

### Handler: `handleListCommand(msg: IncomingMessage)`

1. Call `repository.getActiveItems(chatId)`
2. If no items → reply "No tracked items"
3. Format each item as a line: `{productName} — expires {date} ({daysUntil} days)`
4. Attach inline keyboard with "Consumed" and "Delete" buttons per item

### Handler: `handleConsumeAction(msg: IncomingMessage)`

1. Extract `itemId` from callback data
2. Call `repository.markConsumed(itemId)`
3. Reply with confirmation
4. Update the original message (remove buttons or strike through)

### Handler: `handleDeleteAction(msg: IncomingMessage)`

1. Extract `itemId` from callback data
2. Call `repository.deleteItem(itemId)`
3. Reply with confirmation

### Handler: `handleLangCommand(msg: IncomingMessage)`

- Replies with language selection inline buttons: "English 🇬🇧" / "Українська 🇺🇦"
- Uses the user's current locale for the prompt text

### Handler: `handleLangSelection(msg: IncomingMessage)`

1. Extract locale from callback data (`lang:en` → `'en'`, `lang:uk` → `'uk'`)
2. Call `i18n.setLocale(chatId, locale)`
3. Reply with confirmation in the newly selected language

### Handler: `handleUnknownMessage(msg: IncomingMessage)`

- Reply with a hint in user's locale (via `i18n.t()`): "Send me a photo of a food label, or use /help"

## Message Types (from shared/)

```typescript
interface IncomingMessage {
  id: string
  chatId: string
  type: 'text' | 'photo' | 'callback'
  text: string | null
  imageBuffer: Buffer | null
  imageMimeType: string | null
  callbackData: string | null
}

type MessageHandler = (msg: IncomingMessage) => Promise<void>
type CallbackQueryHandler = (msg: IncomingMessage) => Promise<void>

interface OutgoingMessage {
  text: string
  parseMode?: 'HTML' | 'Markdown'
  inlineKeyboard?: InlineButton[][]
  replyToMessageId?: string
}

interface InlineButton {
  text: string
  callbackData: string
}

interface AlertPayload {
  foodItemId: string
  productName: string
  expiryDate: string
  daysUntilExpiry: number
}
```

## i18n Usage

All user-facing strings go through `i18n.t(chatId, key, params)`. The engine never contains hardcoded user-facing text. This applies to all handlers — welcome messages, error messages, confirmations, button labels, list formatting, etc.

## Conversation State

For the confirmation flow (low confidence extraction), the engine needs minimal state:

- A `Map<string, PendingConfirmation>` keyed by `chatId`
- When awaiting confirmation, the next text message from that chat is checked for "yes"/"no"
- Pending confirmations expire after 5 minutes (cleared by a simple timeout)
- This is in-memory only — acceptable for a single-instance bot

## Testing Strategy

- All dependencies (adapter, vision, repository) are mocked
- Test each handler in isolation
- Test routing logic (photo → handlePhotoMessage, /list → handleListCommand, etc.)
- Test low-confidence confirmation flow
- Test error paths (vision fails, repository fails)
- Test callback query parsing

## Tasks

1. Implement message routing logic
2. Implement `handleStartCommand` and `handleHelpCommand`
3. Implement `handlePhotoMessage` with confirmation flow
4. Implement `handleListCommand` with inline keyboard construction
5. Implement `handleConsumeAction` and `handleDeleteAction`
6. Implement `handleUnknownMessage`
7. Write tests for all handlers and routing

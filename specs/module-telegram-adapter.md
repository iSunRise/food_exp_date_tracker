# Module: Telegram Adapter

## Scope

Implements `BotAdapter` using grammY. Translates between Telegram-specific APIs and the adapter-agnostic interface. This is the **only** module that imports grammY.

## Files

| File                              | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `src/adapters/telegram.ts`        | `BotAdapter` implementation via grammY |
| `tests/adapters/telegram.test.ts` | Unit tests                             |

## Dependencies

- `grammy` — Telegram Bot Framework
- `BotAdapter` interface from `src/shared/interfaces.ts`
- Receives `TELEGRAM_BOT_TOKEN` from config

## src/adapters/telegram.ts

Implements `BotAdapter` interface.

### Constructor

Receives:
- `token: string` — Telegram bot token
- Creates a `Bot` instance from grammY internally

### Method: `onMessage(handler: MessageHandler): void`

- Registers grammY listeners for:
  - `bot.on("message:text", ...)` — text messages
  - `bot.on("message:photo", ...)` — photo messages
- Translates grammY `Context` into `IncomingMessage`:
  - `id` → `ctx.message.message_id.toString()`
  - `chatId` → `ctx.chat.id.toString()`
  - `type` → `'text'` or `'photo'`
  - `text` → `ctx.message.text` or `ctx.message.caption`
  - For photos: downloads the largest photo size via `ctx.api.getFile()`, fetches the file buffer
  - `imageBuffer` → downloaded photo buffer
  - `imageMimeType` → derived from file extension

### Method: `onCallbackQuery(handler: CallbackQueryHandler): void`

- Registers `bot.on("callback_query:data", ...)`
- Translates into `IncomingMessage` with `type: 'callback'`:
  - `callbackData` → `ctx.callbackQuery.data`
  - `chatId` → `ctx.callbackQuery.message.chat.id.toString()`
- Answers the callback query (removes loading spinner) via `ctx.answerCallbackQuery()`

### Method: `sendMessage(chatId: string, message: OutgoingMessage): Promise<void>`

- Calls `bot.api.sendMessage(chatId, message.text, options)`
- Maps `OutgoingMessage.inlineKeyboard` → grammY `InlineKeyboard`
- Maps `parseMode` to grammY format

### Method: `sendAlert(chatId: string, alert: AlertPayload): Promise<void>`

- Formats the alert into a user-friendly message:
  ```
  ⚠️ {productName} expires in {daysUntilExpiry} day(s)!
  Expiry date: {expiryDate}
  ```
- Attaches inline keyboard with "Mark Consumed" button (`consume:{foodItemId}`)
- Sends via `bot.api.sendMessage()`

### Method: `start(): Promise<void>`

- Calls `bot.start()` (long polling mode)
- Logs bot info (`bot.api.getMe()`) on startup

### Method: `stop(): Promise<void>`

- Calls `bot.stop()`

## Photo Download Logic

grammY photo handling:
1. `ctx.message.photo` is an array of `PhotoSize` — pick the largest (last element)
2. Call `ctx.api.getFile(fileId)` to get file path
3. Fetch file from `https://api.telegram.org/file/bot{token}/{filePath}`
4. Return as `Buffer`

This download logic should be a private method within the adapter.

## Error Handling

- grammY errors (network, API) are caught within the adapter
- `bot.catch()` handler logs errors and prevents crashes
- If photo download fails, the `IncomingMessage` is sent with `imageBuffer: null` — the engine handles this gracefully

## Testing Strategy

- Mock grammY's `Bot` class and `Api` class
- Test that `onMessage` correctly translates text messages → `IncomingMessage`
- Test that `onMessage` correctly translates photo messages → `IncomingMessage` with buffer
- Test that `sendMessage` correctly maps `OutgoingMessage` → grammY API calls
- Test that `sendAlert` formats alert correctly and attaches inline keyboard
- Test callback query translation

## Tasks

1. Implement `TelegramAdapter` class
2. Implement photo download helper (private method)
3. Implement `IncomingMessage` translation for text, photo, and callback messages
4. Implement `sendMessage` with inline keyboard mapping
5. Implement `sendAlert` with formatted alert messages
6. Write unit tests with mocked grammY

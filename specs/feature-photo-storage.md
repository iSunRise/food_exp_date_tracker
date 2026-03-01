# Feature: Photo Storage & Retrieval

## Overview

When a user sends a food label photo, the bot stores the original image on S3 (in addition to extracting the expiry date). Users can later view the photo for any tracked item via a "Photo" button. This document describes all changes to existing modules required to support this feature.

For the new `ImageStorageService` module itself, see [module-image-storage.md](./module-image-storage.md).

## User Flows

### Flow 1a: Photo Upload with S3 Storage (extends existing Flow 1)

Existing steps 1–9 remain unchanged. New behavior is inserted between extraction and persistence:

1. _(existing)_ User sends a photo
2. _(existing)_ Adapter downloads image, wraps in `IncomingMessage`
3. _(existing)_ Photo handler calls `VisionService.extractExpiryDate()`
4. _(existing)_ VisionService returns `ExtractionResult`
5. **NEW** — If extraction succeeds (has expiry date), photo handler calls `imageStorage.upload({ chatId, itemId, buffer, mimeType })`
6. **NEW** — The returned S3 object key is passed as `imageUrl` to `repository.addItem()`
7. _(existing)_ Engine replies with confirmation

**Low-confidence flow**: The S3 upload happens when the item is actually saved — either immediately (high confidence) or after user confirms "yes". The pending confirmation payload stores the image buffer and mime type so it's available at confirmation time.

### Flow 5: View Photo (new)

1. User taps "Photo" button on a list item or alert
2. Adapter receives callback `photo:{itemId}`, wraps as `IncomingMessage`
3. Bot engine dispatches to `photoViewHandler`
4. Handler fetches item via `repository.getItemById(itemId)`
5. If item has no `imageUrl`: replies with `noPhotoAvailable`
6. Handler calls `imageStorage.getUrl(item.imageUrl)` to get a presigned URL
7. Handler calls `adapter.sendPhoto(chatId, presignedUrl, caption)` to send the image back
8. User sees the original food label photo in chat

### Flow 2a: List with Photo Button (extends existing Flow 2)

1. _(existing)_ User sends `/list`
2. _(existing)_ Engine fetches active items
3. **CHANGED** — For each item that has `imageUrl` (not null), add a third button "Photo" with callback data `photo:{id}` alongside existing "Consume" and "Delete" buttons
4. _(existing)_ Adapter sends formatted message

### Flow 4a: Delete with S3 Cleanup (extends existing Flow 4)

1. _(existing)_ User taps "Delete" button
2. _(existing)_ Delete handler fetches item, calls `repository.deleteItem()`
3. **NEW** — If item has `imageUrl`, handler calls `imageStorage.delete(item.imageUrl)`
4. _(existing)_ Handler replies with confirmation

## Changes by Module

### 1. Shared Interfaces (`src/shared/interfaces.ts`)

**Add** `ImageStorageService` interface:

```typescript
interface ImageStorageService {
  upload(params: ImageUploadParams): Promise<string>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

**Add** `sendPhoto` to `BotAdapter`:

```typescript
interface BotAdapter {
  // ... existing methods ...
  sendPhoto(chatId: string, photoUrl: string, caption?: string): Promise<void>;
}
```

### 2. Shared Schemas (`src/shared/schemas.ts`)

**Add** `ImageUploadParamsSchema`:

```typescript
export const ImageUploadParamsSchema = v.object({
  chatId: v.string(),
  itemId: v.string(),
  buffer: v.instance(Buffer),
  mimeType: v.string(),
});
```

### 3. Shared Types (`src/shared/types.ts`)

**Add** inferred type:

```typescript
export type ImageUploadParams = v.InferOutput<typeof ImageUploadParamsSchema>;
```

### 4. Configuration (`src/config.ts`)

**Add** S3 environment variables to `EnvironmentSchema`:

```typescript
S3_BUCKET: v.pipe(v.string(), v.nonEmpty("S3_BUCKET is required")),
S3_REGION: v.optional(v.string(), "us-east-1"),
S3_ENDPOINT: v.optional(v.string()),
S3_ACCESS_KEY_ID: v.pipe(v.string(), v.nonEmpty("S3_ACCESS_KEY_ID is required")),
S3_SECRET_ACCESS_KEY: v.pipe(v.string(), v.nonEmpty("S3_SECRET_ACCESS_KEY is required")),
S3_FORCE_PATH_STYLE: v.optional(v.string(), "false"),
```

**Add** to `Config` interface and `loadConfig()`:

```typescript
s3Bucket: string;
s3Region: string;
s3Endpoint?: string;
s3AccessKeyId: string;
s3SecretAccessKey: string;
s3ForcePathStyle: boolean;
```

Parse `S3_FORCE_PATH_STYLE` as boolean: `parsed.S3_FORCE_PATH_STYLE === "true"`.

### 5. Telegram Adapter (`src/adapters/telegram.ts`)

**Add** `sendPhoto` method:

```typescript
async sendPhoto(chatId: string, photoUrl: string, caption?: string): Promise<void> {
  await this.bot.api.sendPhoto(chatId, photoUrl, caption ? { caption } : undefined);
}
```

This uses grammY's `api.sendPhoto()` which accepts a URL string. Telegram downloads the image from the presigned URL and delivers it to the user.

**Note**: The `TelegramApiLike` interface needs a `sendPhoto` method added:

```typescript
interface TelegramApiLike {
  // ... existing ...
  sendPhoto(
    chatId: string,
    photo: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}
```

### 6. Bot Handler Context (`src/bot/handler.ts`)

**Add** `imageStorage` to `HandlerContext`:

```typescript
interface HandlerContext {
  adapter: BotAdapter;
  vision: VisionService;
  repository: FoodRepository;
  i18n: I18nService;
  imageStorage: ImageStorageService;  // NEW
  sendLocalized(chatId: string, key: string, options?: SendLocalizedOptions): Promise<void>;
}
```

### 7. Bot Engine (`src/bot/engine.ts`)

**Add** `imageStorage` to `BotEngineOptions`:

```typescript
interface BotEngineOptions {
  adapter: BotAdapter;
  vision: VisionService;
  repository: FoodRepository;
  i18n: I18nService;
  imageStorage: ImageStorageService;  // NEW
  handlers: BotHandler[];
}
```

The engine passes `imageStorage` through to the `HandlerContext`.

### 8. Photo Handler (`src/bot/handlers/photo.ts`)

**Changes to `createPhotoHandler`**:

After successful extraction and when saving the item (both high-confidence immediate save and post-confirmation save), upload the photo to S3:

```
// High-confidence path:
1. Generate a temporary itemId (uuid) for the S3 key
2. Upload: key = await ctx.imageStorage.upload({ chatId, itemId, buffer: imageBuffer, mimeType: imageMimeType })
3. Save: await ctx.repository.addItem({ ..., imageUrl: key })

// Low-confidence path (store buffer in pending confirmation):
1. Add imageBuffer and imageMimeType to the PendingConfirmation payload
2. On "yes" confirmation: upload to S3, then save with imageUrl
```

**Changes to `PendingConfirmation`** type (in `src/bot/handlers/confirmation.ts`):

Add fields to hold the photo buffer for deferred upload:

```typescript
interface PendingConfirmation {
  productName: string;
  expiryDate: string;
  confidence: number;
  rawDateText: string | null;
  imageBuffer: Buffer | null;     // NEW
  imageMimeType: string | null;   // NEW
}
```

### 9. Confirmation Handler (`src/bot/handlers/confirmation.ts`)

**Changes to "yes" branch**:

When confirming, if `pending.imageBuffer` is present:

1. Generate item UUID
2. Upload photo: `key = await ctx.imageStorage.upload({ chatId, itemId, buffer: pending.imageBuffer, mimeType: pending.imageMimeType })`
3. Save item with `imageUrl: key`

### 10. List Handler (`src/bot/handlers/list.ts`)

**Changes to button layout**:

For items that have `imageUrl` (not null), add a "Photo" button:

```typescript
const buttons = items.map((item) => {
  const row = [
    { text: ctx.i18n.t(chatId, "btnConsume"), callbackData: `consume:${item.id}` },
    { text: ctx.i18n.t(chatId, "btnDelete"), callbackData: `delete:${item.id}` },
  ];
  if (item.imageUrl) {
    row.push({ text: ctx.i18n.t(chatId, "btnPhoto"), callbackData: `photo:${item.id}` });
  }
  return row;
});
```

### 11. New Handler: Photo View (`src/bot/handlers/photo-view.ts`)

New callback handler for `photo:{id}`:

```typescript
export const photoViewHandler: BotHandler = {
  name: "photoView",

  match(message: IncomingMessage): boolean {
    return message.type === "callback" && message.callbackData?.startsWith("photo:") === true;
  },

  async handle(message: IncomingMessage, ctx: HandlerContext): Promise<void> {
    const itemId = extractId(message.callbackData!, "photo:");
    if (!itemId) return;

    const item = await ctx.repository.getItemById(itemId);
    if (!item || !item.imageUrl) {
      await ctx.sendLocalized(message.chatId, "noPhotoAvailable");
      return;
    }

    const url = await ctx.imageStorage.getUrl(item.imageUrl);
    const caption = ctx.i18n.t(message.chatId, "photoCaption", {
      productName: item.productName,
      expiryDate: item.expiryDate,
    });

    await ctx.adapter.sendPhoto(message.chatId, url, caption);
  },
};
```

### 12. Delete Handler (`src/bot/handlers/delete.ts`)

**Add** S3 cleanup after soft delete:

```typescript
// After repository.deleteItem(itemId):
if (item.imageUrl) {
  await ctx.imageStorage.delete(item.imageUrl);
}
```

Deletion errors from S3 are caught and logged — they must not prevent the item deletion response.

### 13. Handler Registration (`src/bot/handlers/index.ts`)

**Add** `photoViewHandler` to handler array at priority 1 (alongside other callback handlers):

| Priority | Handler(s) |
| --- | --- |
| 1 | `consumeHandler`, `deleteHandler`, `langSelectionHandler`, **`photoViewHandler`** |
| 2 | confirmation handler |
| ... | _(unchanged)_ |

### 14. Main Entrypoint (`src/main.ts`)

**Add** `ImageStorageService` instantiation and wiring:

```typescript
// After vision service, before adapter:
const imageStorage = new S3ImageStorageService({
  bucket: config.s3Bucket,
  region: config.s3Region,
  endpoint: config.s3Endpoint,
  accessKeyId: config.s3AccessKeyId,
  secretAccessKey: config.s3SecretAccessKey,
  forcePathStyle: config.s3ForcePathStyle,
});

// Pass to BotEngine:
const engine = new BotEngine({
  adapter, vision, repository, i18n, imageStorage,
  handlers: createDefaultHandlers(),
});
```

### 15. i18n Translations

**Add** new translation keys to both `en.ts` and `uk.ts`:

| Key | English | Ukrainian |
| --- | --- | --- |
| `btnPhoto` | `"Photo"` | `"Фото"` |
| `noPhotoAvailable` | `"No photo available for this item."` | `"Фото для цього продукту недоступне."` |
| `photoCaption` | `"{productName} — expires {expiryDate}"` | `"{productName} — термін до {expiryDate}"` |
| `photoUploadFailed` | `"Photo saved but image upload failed. The item was still tracked."` | `"Фото збережено, але завантаження зображення не вдалося. Продукт все одно відстежується."` |

### 16. Docker Compose

**Add** MinIO service and init container (see [module-image-storage.md](./module-image-storage.md) for full YAML).

**Add** `minio_data` to volumes section.

**Update** `bot` service `depends_on` to include `minio-init`.

### 17. `.env.example`

**Add**:

```
S3_BUCKET=food-photos
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

## Error Handling

- **Upload failure during photo processing**: The food item is still saved to the database (without `imageUrl`). The user is notified with `photoUploadFailed` — the item is tracked, just without the photo.
- **Presigned URL generation failure**: The `photoViewHandler` replies with `noPhotoAvailable`.
- **S3 delete failure**: Logged but does not block the user-facing delete confirmation. Orphaned S3 objects can be cleaned up via lifecycle policies.
- **Telegram sendPhoto failure** (e.g., URL expired, object missing): Caught by the adapter error handler; user sees a generic error.

## Implementation Order

1. Add `ImageStorageService` interface, schema, types to `src/shared/`
2. Add S3 config variables to `src/config.ts`
3. Implement `S3ImageStorageService` in `src/image-storage/client.ts`
4. Add `sendPhoto` to `BotAdapter` interface and `TelegramAdapter`
5. Add `imageStorage` to `HandlerContext` and `BotEngineOptions`
6. Update `PendingConfirmation` type with `imageBuffer` and `imageMimeType`
7. Update photo handler to upload to S3 on save
8. Update confirmation handler to upload to S3 on "yes"
9. Create `photoViewHandler` (`src/bot/handlers/photo-view.ts`)
10. Update list handler to show "Photo" button
11. Update delete handler to clean up S3 objects
12. Register `photoViewHandler` in handler factory
13. Add i18n keys
14. Wire `ImageStorageService` in `main.ts`
15. Add MinIO to `docker-compose.yml`
16. Update `.env.example`
17. Update tests for all changed handlers

## Testing Notes

- Photo handler tests: mock `imageStorage.upload()`, verify it's called with correct params, verify `imageUrl` is passed to `addItem()`
- Photo handler tests: verify graceful degradation when upload fails (item saved without photo)
- Confirmation handler tests: verify S3 upload happens on "yes" with buffered image
- List handler tests: verify "Photo" button appears only for items with `imageUrl`
- Photo view handler tests: mock `imageStorage.getUrl()`, verify `adapter.sendPhoto()` is called
- Delete handler tests: verify `imageStorage.delete()` is called when item has `imageUrl`
- Delete handler tests: verify deletion succeeds even if S3 delete fails

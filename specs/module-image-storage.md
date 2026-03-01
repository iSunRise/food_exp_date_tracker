# Module: Image Storage

## Scope

S3-compatible object storage for food label photos. Uploads photo buffers received from Telegram, stores them keyed by food item, and generates time-limited presigned URLs for retrieval. Uses the AWS SDK v3 S3 client, compatible with any S3-compatible provider (AWS S3, MinIO, Cloudflare R2, etc.).

## Files

| File | Purpose |
| --- | --- |
| `src/image-storage/client.ts` | `ImageStorageService` implementation |
| `tests/image-storage/client.test.ts` | Unit tests with mocked S3 client |

## Dependencies

- `@aws-sdk/client-s3` — S3 operations (PutObject, DeleteObject, HeadObject)
- `@aws-sdk/s3-request-presigner` — presigned URL generation (GetObject)
- Receives S3 config slice from `config.ts`

## Interface

Defined in `src/shared/interfaces.ts`:

```typescript
interface ImageStorageService {
  upload(params: ImageUploadParams): Promise<string>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

### `upload(params: ImageUploadParams): Promise<string>`

Uploads an image buffer to S3. Returns the S3 object key (not a URL — keys are stable, URLs expire).

**Parameters** (`ImageUploadParams` — defined in `src/shared/schemas.ts`):

| Field | Type | Description |
| --- | --- | --- |
| `chatId` | `string` | Telegram chat ID — used as key prefix for isolation |
| `itemId` | `string` | Food item UUID — used as filename |
| `buffer` | `Buffer` | Raw image bytes |
| `mimeType` | `string` | MIME type (e.g., `image/jpeg`) |

**Object key format**: `{chatId}/{itemId}{ext}`

- Extension is derived from `mimeType` (e.g., `image/jpeg` → `.jpg`, `image/png` → `.png`)
- Example: `123456789/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`

**Behavior**:
1. Derives file extension from `mimeType`
2. Constructs the object key
3. Calls `PutObjectCommand` with `ContentType` set to the `mimeType`
4. Returns the object key

### `getUrl(key: string): Promise<string>`

Generates a presigned GET URL for the given object key.

- Uses `getSignedUrl` from `@aws-sdk/s3-request-presigner`
- URL expires after `PRESIGNED_URL_EXPIRY_SECONDS` (default: `3600` — 1 hour)
- Returns the presigned URL string

### `delete(key: string): Promise<void>`

Deletes the object from S3.

- Calls `DeleteObjectCommand`
- Silently succeeds if the object doesn't exist (S3 default behavior)

## Implementation: `S3ImageStorageService`

```typescript
class S3ImageStorageService implements ImageStorageService {
  constructor(options: {
    bucket: string;
    region: string;
    endpoint?: string;       // For MinIO / R2 / custom S3-compatible
    accessKeyId: string;
    secretAccessKey: string;
    presignedUrlExpiry?: number; // seconds, default 3600
    forcePathStyle?: boolean;   // true for MinIO
  })
}
```

### Constructor

1. Creates an `S3Client` instance with the provided credentials and region
2. If `endpoint` is provided, configures the client for S3-compatible services
3. If `forcePathStyle` is `true`, sets `forcePathStyle: true` (required for MinIO)
4. Stores `bucket` and `presignedUrlExpiry` as instance fields

### MIME → Extension Mapping

| MIME Type | Extension |
| --- | --- |
| `image/jpeg` | `.jpg` |
| `image/png` | `.png` |
| `image/webp` | `.webp` |
| `image/gif` | `.gif` |
| `image/heic` | `.heic` |
| `image/bmp` | `.bmp` |
| `image/tiff` | `.tiff` |
| _default_ | `.bin` |

### Error Handling

- `upload`: Throws on S3 errors (caller should handle). Logs error context.
- `getUrl`: Throws if presigning fails (e.g., invalid key format). Does **not** verify object existence — presigned URLs for missing objects will return 404 at access time.
- `delete`: Catches and logs errors but does **not** throw — deletion failures should not block item deletion.

## Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `DEFAULT_PRESIGNED_URL_EXPIRY` | `3600` | 1-hour presigned URL validity |

## Configuration

New environment variables added to `src/config.ts`:

| Variable | Required | Description |
| --- | --- | --- |
| `S3_BUCKET` | Yes | S3 bucket name |
| `S3_REGION` | No | AWS region (default: `us-east-1`) |
| `S3_ENDPOINT` | No | Custom endpoint for S3-compatible services |
| `S3_ACCESS_KEY_ID` | Yes | Access key |
| `S3_SECRET_ACCESS_KEY` | Yes | Secret key |
| `S3_FORCE_PATH_STYLE` | No | Set to `true` for MinIO (default: `false`) |

## Docker Compose: MinIO Service

For local development, a MinIO service is added to `docker-compose.yml`:

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  ports:
    - "9000:9000"
    - "9001:9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 3
```

A bucket creation init container or startup script creates the `food-photos` bucket:

```yaml
minio-init:
  image: minio/mc:latest
  depends_on:
    minio:
      condition: service_healthy
  entrypoint: >
    /bin/sh -c "
    mc alias set local http://minio:9000 minioadmin minioadmin &&
    mc mb --ignore-existing local/food-photos
    "
```

Corresponding `.env.example` values:

```
S3_BUCKET=food-photos
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

## Testing Strategy

- Mock `S3Client` using a lightweight mock (vi.mock or manual mock object)
- Test `upload`: verify `PutObjectCommand` is called with correct key, content type, and body
- Test `getUrl`: verify `GetObjectCommand` + `getSignedUrl` are called with correct key and expiry
- Test `delete`: verify `DeleteObjectCommand` is called; verify no throw on error
- Test MIME-to-extension mapping for all supported types + default fallback
- Test object key construction: `{chatId}/{itemId}.{ext}`

## Tasks

1. Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
2. Add `ImageStorageService` interface to `src/shared/interfaces.ts`
3. Add `ImageUploadParamsSchema` to `src/shared/schemas.ts`
4. Add S3 environment variables to `src/config.ts`
5. Implement `S3ImageStorageService` in `src/image-storage/client.ts`
6. Add MinIO service + init container to `docker-compose.yml`
7. Update `.env.example` with S3 variables
8. Write unit tests
9. Verify upload/download flow with MinIO locally

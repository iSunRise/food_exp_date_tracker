# Module: OCR / Vision Service

## Scope

Takes a food label image buffer, sends it to a vision-capable LLM via the `LlmClient` interface, and returns structured extraction results (product name, expiry date, confidence). Owns the prompt engineering. Knows nothing about Telegram, database, or scheduling.

## Files

| File                        | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `src/ocr/vision.ts`         | `VisionService` implementation            |
| `tests/ocr/vision.test.ts`  | Unit tests with mocked LlmClient          |

## Dependencies

- `LlmClient` interface (injected, from `src/shared/interfaces.ts`)
- `valibot` — to validate/parse LLM response into structured output
- No direct dependency on OpenAI SDK or OpenRouter

## src/ocr/vision.ts

Implements `VisionService` interface from `src/shared/interfaces.ts`.

### Constructor

Receives:
- `llmClient: LlmClient` (injected)

### Method: `extractExpiryDate(image: Buffer, mimeType: string): Promise<ExtractionResult>`

**Steps:**

1. Convert image `Buffer` to base64 string
2. Construct the system prompt (see Prompt Design below)
3. Call `llmClient.visionCompletion()` with the image and prompts
4. Parse the LLM text response as JSON
5. Validate the JSON against the `ExtractionResultSchema` (valibot)
6. Return the validated `ExtractionResult`

**If parsing/validation fails:**
- Return an `ExtractionResult` with `success: false` and an error message
- Do NOT throw — the bot engine decides how to handle failures

### Prompt Design

The system prompt instructs the LLM to:
1. Examine the food label image
2. Identify the product name (or best guess)
3. Find any expiration/best-before/use-by date
4. Return a JSON object with a specific structure

System prompt should request JSON output in this format:
```json
{
  "productName": "string or null",
  "expiryDate": "YYYY-MM-DD or null",
  "confidence": 0.0-1.0,
  "rawDateText": "the exact text found on the label",
  "notes": "any relevant context (e.g., 'best before' vs 'use by')"
}
```

Key prompt considerations:
- Handle multiple date formats (MM/DD/YYYY, DD.MM.YYYY, YYYY-MM-DD, "Best Before March 2026", etc.)
- Distinguish between manufacturing date and expiry date
- Handle cases where no date is visible
- Request the raw date text as-is so the user can verify

## Interface Types (from shared/)

```typescript
interface ExtractionResult {
  success: boolean
  productName: string | null
  expiryDate: string | null   // ISO date string YYYY-MM-DD, null if not found
  confidence: number          // 0.0 - 1.0
  rawDateText: string | null  // exact text from label
  notes: string | null
  error: string | null        // populated when success is false
}
```

## Edge Cases

- **No date found**: Return `success: true`, `expiryDate: null`, with a note explaining no date was visible
- **Multiple dates on label**: Extract the expiry/best-before date; if ambiguous, set lower confidence and note the ambiguity
- **Illegible image**: Return `success: false` with descriptive error
- **LLM returns invalid JSON**: Caught by valibot validation → return `success: false`
- **LLM rate limit / error**: Let the LlmClient error propagate (engine handles retry logic)

## Testing Strategy

- Mock `LlmClient` — inject a fake that returns canned responses
- Test successful extraction with various JSON formats
- Test handling of malformed LLM responses
- Test handling of "no date found" responses
- Test base64 encoding of image buffer
- No real LLM calls in tests

## Tasks

1. Write the system prompt and user prompt templates
2. Implement `VisionService` class in `src/ocr/vision.ts`
3. Add valibot schema for parsing LLM JSON response (internal to this module)
4. Write unit tests with mocked LlmClient

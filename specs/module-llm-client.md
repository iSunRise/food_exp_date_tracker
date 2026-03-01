# Module: LLM Client

## Scope

A thin wrapper around the OpenAI SDK configured to talk to OpenRouter. Provides text and vision completion methods. Knows nothing about OCR, food, or Telegram.

## Files

| File                      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `src/llm/client.ts`       | `LlmClient` implementation              |
| `tests/llm/client.test.ts`| Unit tests with mocked HTTP              |

## Dependencies

- `openai` — OpenAI SDK (used with OpenRouter's compatible endpoint)
- Receives `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from config

## How OpenRouter Integration Works

OpenRouter exposes an OpenAI-compatible API at `https://openrouter.ai/api/v1`. The OpenAI SDK works out of the box by overriding `baseURL` and passing the OpenRouter key as the API key.

Configuration:
- `baseURL`: `https://openrouter.ai/api/v1`
- `apiKey`: the OpenRouter API key
- Default headers: `HTTP-Referer` and `X-Title` as recommended by OpenRouter docs

## src/llm/client.ts

Implements `LlmClient` interface from `src/shared/interfaces.ts`.

### Constructor

Receives:
- `apiKey: string`
- `model: string` (default model ID)
- Creates an `OpenAI` client instance with `baseURL` set to OpenRouter

### Method: `chatCompletion(params: LlmCompletionParams): Promise<LlmCompletionResult>`

- Delegates to `openai.chat.completions.create()`
- Maps `LlmCompletionParams` to OpenAI format (messages, temperature, max_tokens)
- Maps response back to `LlmCompletionResult`
- Handles API errors gracefully — wraps in typed error

### Method: `visionCompletion(params: LlmVisionParams): Promise<LlmCompletionResult>`

- Similar to `chatCompletion` but constructs a message with image content
- Accepts image as base64 data URL or a URL string
- Builds the `content` array with `image_url` type as per OpenAI vision API format
- Same response mapping and error handling

### Error Handling

- Catches OpenAI SDK errors, wraps them in a module-specific error type
- Distinguishes between: rate limit errors, auth errors, model errors, network errors
- Exposes error type so callers can decide retry strategy without depending on OpenAI SDK types

## Interface Types (from shared/)

```typescript
interface LlmCompletionParams {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  model?: string  // override default model per-call
}

interface LlmVisionParams {
  systemPrompt: string
  userPrompt: string
  imageBase64: string  // base64-encoded image data
  mimeType: string     // e.g. 'image/jpeg'
  temperature?: number
  maxTokens?: number
  model?: string
}

interface LlmCompletionResult {
  content: string
  usage: { promptTokens: number; completionTokens: number }
  model: string  // actual model used (OpenRouter may route differently)
}
```

## Testing Strategy

- Mock the OpenAI SDK at the HTTP level (vi.mock or msw)
- Test that `chatCompletion` correctly maps params → OpenAI format → result
- Test that `visionCompletion` correctly encodes image in message content
- Test error handling for each error category
- No real API calls in unit tests

## Tasks

1. Implement `LlmClient` class in `src/llm/client.ts`
2. Map OpenAI SDK errors to module-specific error types
3. Write unit tests with mocked OpenAI SDK
4. Verify with a manual smoke test against OpenRouter (optional, not in CI)

import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "openai";
import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

import { LlmClientError, OpenRouterLlmClient } from "../../src/llm/client.js";

function createChatCompletion(content: string | null): OpenAI.ChatCompletion {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1,
    model: "openrouter/routed-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: {
          role: "assistant",
          content,
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  };
}

function createClientUnderTest(createImpl?: (request: unknown) => Promise<unknown>) {
  const create = vi.fn(
    createImpl ??
      (() => Promise.resolve(createChatCompletion("Hello from model") as unknown)),
  );

  const client = new OpenRouterLlmClient({
    apiKey: "test-key",
    model: "openrouter/default-model",
    client: {
      chat: {
        completions: {
          create: create as unknown as (
            request: OpenAI.ChatCompletionCreateParamsNonStreaming,
          ) => Promise<OpenAI.ChatCompletion>,
        },
      },
    },
  });

  return { client, create };
}

describe("OpenRouterLlmClient", () => {
  it("maps chatCompletion params and result", async () => {
    const { client, create } = createClientUnderTest();

    const result = await client.chatCompletion({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Say hi." },
      ],
      temperature: 0.2,
      maxTokens: 120,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      model: "openrouter/default-model",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Say hi." },
      ],
      temperature: 0.2,
      max_tokens: 120,
    });
    expect(result).toEqual({
      content: "Hello from model",
      usage: { promptTokens: 12, completionTokens: 8 },
      model: "openrouter/routed-model",
    });
  });

  it("builds visionCompletion payload with data URL image", async () => {
    const { client, create } = createClientUnderTest();

    await client.visionCompletion({
      systemPrompt: "Extract structured data.",
      userPrompt: "Find expiry date.",
      imageBase64: "YWJjMTIz",
      mimeType: "image/png",
      maxTokens: 300,
    });

    const request = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
    expect(request.model).toBe("openrouter/default-model");
    expect(request.max_tokens).toBe(300);
    expect(request.messages[0]).toEqual({
      role: "system",
      content: "Extract structured data.",
    });

    const userMessage = request.messages[1] as OpenAI.ChatCompletionUserMessageParam;
    expect(userMessage.role).toBe("user");
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content).toEqual([
      { type: "text", text: "Find expiry date." },
      { type: "image_url", image_url: { url: "data:image/png;base64,YWJjMTIz" } },
    ]);
  });

  it("does not prepend data URL prefix when image is already a data URL", async () => {
    const { client, create } = createClientUnderTest();

    await client.visionCompletion({
      systemPrompt: "Extract structured data.",
      userPrompt: "Find expiry date.",
      imageBase64: "data:image/jpeg;base64,Zm9vYmFy",
      mimeType: "image/jpeg",
    });

    const request = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
    const userMessage = request.messages[1] as OpenAI.ChatCompletionUserMessageParam;
    expect(userMessage.content).toEqual([
      { type: "text", text: "Find expiry date." },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,Zm9vYmFy" } },
    ]);
  });

  it("maps rate limit errors to typed LlmClientError", async () => {
    const { client } = createClientUnderTest(() =>
      Promise.reject(
        new RateLimitError(
          429,
          { message: "Too many requests" },
          undefined,
          new Headers(),
        ),
      ),
    );

    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toMatchObject({
      name: "LlmClientError",
      type: "rate_limit",
      statusCode: 429,
      retryable: true,
    });
  });

  it("maps auth errors to typed LlmClientError", async () => {
    const { client } = createClientUnderTest(() =>
      Promise.reject(
        new AuthenticationError(
          401,
          { message: "Invalid API key" },
          undefined,
          new Headers(),
        ),
      ),
    );

    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toMatchObject({
      name: "LlmClientError",
      type: "auth",
      statusCode: 401,
      retryable: false,
    });
  });

  it("maps model/validation errors to typed LlmClientError", async () => {
    const { client } = createClientUnderTest(() =>
      Promise.reject(
        new BadRequestError(
          400,
          { message: "Model does not support this request" },
          undefined,
          new Headers(),
        ),
      ),
    );

    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toMatchObject({
      name: "LlmClientError",
      type: "model",
      statusCode: 400,
      retryable: false,
    });
  });

  it("maps connection errors to typed LlmClientError", async () => {
    const { client } = createClientUnderTest(() =>
      Promise.reject(new APIConnectionError({ message: "Connection failed" })),
    );

    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toMatchObject({
      name: "LlmClientError",
      type: "network",
      retryable: true,
    });
  });

  it("returns model error when completion content is missing", async () => {
    const { client } = createClientUnderTest(() =>
      Promise.resolve(createChatCompletion(null)),
    );

    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toBeInstanceOf(LlmClientError);
    await expect(
      client.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toMatchObject({
      type: "model",
      retryable: false,
    });
  });
});

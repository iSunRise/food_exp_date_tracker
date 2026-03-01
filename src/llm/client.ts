import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai";

import type { LlmClient } from "../shared/interfaces.js";
import type {
  LlmCompletionParams,
  LlmCompletionResult,
  LlmVisionParams,
} from "../shared/types.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_REFERER = "https://food-exp-date-tracker.local";
const DEFAULT_TITLE = "Food Expiration Date Tracker";

export type LlmClientErrorType =
  | "rate_limit"
  | "auth"
  | "model"
  | "network"
  | "unknown";

export class LlmClientError extends Error {
  readonly type: LlmClientErrorType;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    type: LlmClientErrorType,
    message: string,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LlmClientError";
    this.type = type;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

interface OpenAiClientLike {
  chat: {
    completions: {
      create(
        request: OpenAI.ChatCompletionCreateParamsNonStreaming,
      ): Promise<OpenAI.ChatCompletion>;
    };
  };
}

export interface OpenRouterLlmClientOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
  referer?: string;
  title?: string;
  client?: OpenAiClientLike;
}

export class OpenRouterLlmClient implements LlmClient {
  private readonly client: OpenAiClientLike;
  private readonly defaultModel: string;

  constructor(options: OpenRouterLlmClientOptions) {
    this.defaultModel = options.model;
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL ?? OPENROUTER_BASE_URL,
        defaultHeaders: {
          "HTTP-Referer": options.referer ?? DEFAULT_REFERER,
          "X-Title": options.title ?? DEFAULT_TITLE,
        },
      });
  }

  async chatCompletion(params: LlmCompletionParams): Promise<LlmCompletionResult> {
    const request: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: params.model ?? this.defaultModel,
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(params.temperature === undefined ? {} : { temperature: params.temperature }),
      ...(params.maxTokens === undefined ? {} : { max_tokens: params.maxTokens }),
    };

    return this.executeCompletion(request);
  }

  async visionCompletion(params: LlmVisionParams): Promise<LlmCompletionResult> {
    const imageUrl = params.imageBase64.startsWith("data:")
      ? params.imageBase64
      : `data:${params.mimeType};base64,${params.imageBase64}`;

    const request: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: params.model ?? this.defaultModel,
      messages: [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: params.userPrompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      ...(params.temperature === undefined ? {} : { temperature: params.temperature }),
      ...(params.maxTokens === undefined ? {} : { max_tokens: params.maxTokens }),
    };

    return this.executeCompletion(request);
  }

  private async executeCompletion(
    request: OpenAI.ChatCompletionCreateParamsNonStreaming,
  ): Promise<LlmCompletionResult> {
    try {
      const response = await this.client.chat.completions.create(request);
      const content = response.choices[0]?.message.content;

      if (content === null || content === undefined) {
        throw new LlmClientError(
          "model",
          "LLM response did not include a text completion.",
          { retryable: false },
        );
      }

      return {
        content,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): LlmClientError {
    if (error instanceof LlmClientError) {
      return error;
    }

    if (error instanceof RateLimitError) {
      return new LlmClientError("rate_limit", error.message, {
        statusCode: error.status,
        retryable: true,
        cause: error,
      });
    }

    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return new LlmClientError("auth", error.message, {
        statusCode: error.status,
        retryable: false,
        cause: error,
      });
    }

    if (
      error instanceof BadRequestError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof UnprocessableEntityError
    ) {
      return new LlmClientError("model", error.message, {
        statusCode: error.status,
        retryable: false,
        cause: error,
      });
    }

    if (
      error instanceof APIConnectionError ||
      error instanceof APIConnectionTimeoutError ||
      error instanceof InternalServerError
    ) {
      return new LlmClientError("network", error.message, {
        statusCode: error instanceof APIError ? error.status : undefined,
        retryable: true,
        cause: error,
      });
    }

    if (error instanceof APIError) {
      const type = this.getTypeFromStatus(error.status);
      return new LlmClientError(type, error.message, {
        statusCode: error.status,
        retryable: type === "rate_limit" || type === "network",
        cause: error,
      });
    }

    if (error instanceof Error) {
      return new LlmClientError("unknown", error.message, {
        retryable: false,
        cause: error,
      });
    }

    return new LlmClientError("unknown", "Unexpected LLM client error.", {
      retryable: false,
      cause: error,
    });
  }

  private getTypeFromStatus(status?: number): LlmClientErrorType {
    if (status === 429) {
      return "rate_limit";
    }

    if (status === 401 || status === 403) {
      return "auth";
    }

    if (status !== undefined && status >= 500) {
      return "network";
    }

    return "model";
  }
}

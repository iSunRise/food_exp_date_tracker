import type * as v from "valibot";
import type {
  IncomingMessageSchema,
  OutgoingMessageSchema,
  InlineButtonSchema,
  AlertPayloadSchema,
  ExtractionResultSchema,
  FoodItemSchema,
  NewFoodItemSchema,
  LlmCompletionParamsSchema,
  LlmVisionParamsSchema,
  LlmCompletionResultSchema,
} from "./schemas.js";

export type IncomingMessage = v.InferOutput<typeof IncomingMessageSchema>;
export type OutgoingMessage = v.InferOutput<typeof OutgoingMessageSchema>;
export type InlineButton = v.InferOutput<typeof InlineButtonSchema>;
export type AlertPayload = v.InferOutput<typeof AlertPayloadSchema>;
export type ExtractionResult = v.InferOutput<typeof ExtractionResultSchema>;
export type FoodItem = v.InferOutput<typeof FoodItemSchema>;
export type NewFoodItem = v.InferOutput<typeof NewFoodItemSchema>;
export type LlmCompletionParams = v.InferOutput<typeof LlmCompletionParamsSchema>;
export type LlmVisionParams = v.InferOutput<typeof LlmVisionParamsSchema>;
export type LlmCompletionResult = v.InferOutput<typeof LlmCompletionResultSchema>;

import * as v from "valibot";

// === Incoming Message ===

export const IncomingMessageSchema = v.object({
  id: v.string(),
  chatId: v.string(),
  type: v.picklist(["text", "photo", "callback"]),
  text: v.nullable(v.string()),
  imageBuffer: v.nullable(v.instance(Buffer)),
  imageMimeType: v.nullable(v.string()),
  callbackData: v.nullable(v.string()),
});

// === Outgoing Message ===

export const InlineButtonSchema = v.object({
  text: v.string(),
  callbackData: v.string(),
});

export const OutgoingMessageSchema = v.object({
  text: v.string(),
  parseMode: v.optional(v.picklist(["HTML", "Markdown"])),
  inlineKeyboard: v.optional(v.array(v.array(InlineButtonSchema))),
  replyToMessageId: v.optional(v.string()),
});

// === Alert Payload ===

export const AlertPayloadSchema = v.object({
  foodItemId: v.string(),
  productName: v.string(),
  expiryDate: v.string(),
  daysUntilExpiry: v.number(),
  localizedText: v.optional(v.string()),
  localizedConsumeLabel: v.optional(v.string()),
});

// === Extraction Result ===

export const ExtractionResultSchema = v.object({
  success: v.boolean(),
  productName: v.nullable(v.string()),
  expiryDate: v.nullable(v.string()),
  confidence: v.number(),
  rawDateText: v.nullable(v.string()),
  notes: v.nullable(v.string()),
  error: v.nullable(v.string()),
});

// === Food Item ===

export const FoodItemSchema = v.object({
  id: v.string(),
  chatId: v.string(),
  productName: v.string(),
  expiryDate: v.string(),
  imageUrl: v.nullable(v.string()),
  status: v.picklist(["active", "consumed", "expired", "deleted"]),
  confidence: v.nullable(v.number()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const NewFoodItemSchema = v.object({
  chatId: v.string(),
  productName: v.string(),
  expiryDate: v.string(),
  imageUrl: v.optional(v.nullable(v.string())),
  confidence: v.optional(v.nullable(v.number())),
});

// === Image Upload Params ===

export const ImageUploadParamsSchema = v.object({
  chatId: v.string(),
  itemId: v.string(),
  buffer: v.instance(Buffer),
  mimeType: v.string(),
});

// === LLM ===

export const LlmCompletionParamsSchema = v.object({
  messages: v.array(
    v.object({
      role: v.picklist(["system", "user", "assistant"]),
      content: v.string(),
    }),
  ),
  temperature: v.optional(v.number()),
  maxTokens: v.optional(v.number()),
  model: v.optional(v.string()),
});

export const LlmVisionParamsSchema = v.object({
  systemPrompt: v.string(),
  userPrompt: v.string(),
  imageBase64: v.string(),
  mimeType: v.string(),
  temperature: v.optional(v.number()),
  maxTokens: v.optional(v.number()),
  model: v.optional(v.string()),
});

export const LlmCompletionResultSchema = v.object({
  content: v.string(),
  usage: v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
  }),
  model: v.string(),
});

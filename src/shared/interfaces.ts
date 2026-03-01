import type {
  IncomingMessage,
  OutgoingMessage,
  AlertPayload,
  ExtractionResult,
  LlmCompletionParams,
  LlmCompletionResult,
  LlmVisionParams,
  FoodItem,
  NewFoodItem,
  ImageUploadParams,
} from "./types.js";

// === Message Handlers ===

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;
export type CallbackQueryHandler = (msg: IncomingMessage) => Promise<void>;

// === Bot Adapter ===

export interface BotAdapter {
  onMessage(handler: MessageHandler): void;
  onCallbackQuery(handler: CallbackQueryHandler): void;
  sendMessage(chatId: string, message: OutgoingMessage): Promise<void>;
  sendAlert(chatId: string, alert: AlertPayload): Promise<void>;
  sendPhoto(chatId: string, photoUrl: string, caption?: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// === Vision Service ===

export interface VisionService {
  extractExpiryDate(image: Buffer, mimeType: string): Promise<ExtractionResult>;
}

// === LLM Client ===

export interface LlmClient {
  chatCompletion(params: LlmCompletionParams): Promise<LlmCompletionResult>;
  visionCompletion(params: LlmVisionParams): Promise<LlmCompletionResult>;
}

// === Food Repository ===

export interface FoodRepository {
  addItem(item: NewFoodItem): Promise<FoodItem>;
  getActiveItems(chatId: string): Promise<FoodItem[]>;
  getItemById(id: string): Promise<FoodItem | null>;
  markConsumed(id: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
  getItemsExpiringBetween(from: Date, to: Date): Promise<FoodItem[]>;
  recordAlertSent(itemId: string, daysBeforeExpiry: number): Promise<void>;
  getUnalertedItemsForDay(
    targetDate: Date,
    daysBeforeExpiry: number,
  ): Promise<FoodItem[]>;
  getLocale(chatId: string): Promise<string>;
  setLocale(chatId: string, locale: string): Promise<void>;
}

// === i18n Service ===

export type Locale = "en" | "uk";

export interface I18nService {
  t(chatId: string, key: string, params?: Record<string, unknown>): string;
  setLocale(chatId: string, locale: Locale): Promise<void>;
  getLocale(chatId: string): Promise<Locale>;
}

// === Image Storage Service ===

export interface ImageStorageService {
  upload(params: ImageUploadParams): Promise<string>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

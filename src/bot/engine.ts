import * as v from "valibot";

import type {
  BotAdapter,
  FoodRepository,
  I18nService,
  Locale,
  VisionService,
} from "../shared/interfaces.js";
import { IncomingMessageSchema } from "../shared/schemas.js";
import type { IncomingMessage, InlineButton, NewFoodItem } from "../shared/types.js";

export interface BotEngineOptions {
  adapter: BotAdapter;
  vision: VisionService;
  repository: FoodRepository;
  i18n: I18nService;
}

interface PendingConfirmation {
  productName: string;
  expiryDate: string;
  confidence: number;
  rawDateText: string | null;
  timeoutId: NodeJS.Timeout;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOCALE: Locale = "en";
const SUPPORTED_LOCALES: Locale[] = ["en", "uk"];

const YES_TOKENS = new Set(["yes", "y", "tak", "так", "да"]);
const NO_TOKENS = new Set(["no", "n", "ni", "ні", "нет"]);

export class BotEngine {
  private readonly adapter: BotAdapter;
  private readonly vision: VisionService;
  private readonly repository: FoodRepository;
  private readonly i18n: I18nService;

  private readonly pendingConfirmations = new Map<string, PendingConfirmation>();

  constructor(options: BotEngineOptions) {
    this.adapter = options.adapter;
    this.vision = options.vision;
    this.repository = options.repository;
    this.i18n = options.i18n;
  }

  start(): void {
    this.adapter.onMessage(async (incoming) => {
      await this.routeIncoming(incoming);
    });

    this.adapter.onCallbackQuery(async (incoming) => {
      await this.routeIncoming(incoming);
    });
  }

  private async routeIncoming(rawMessage: IncomingMessage): Promise<void> {
    const parsed = v.safeParse(IncomingMessageSchema, rawMessage);
    if (!parsed.success) {
      return;
    }

    const message = parsed.output;

    try {
      if (message.type === "callback") {
        await this.routeCallback(message);
        return;
      }

      if (message.type === "photo") {
        await this.handlePhotoMessage(message);
        return;
      }

      if (message.type !== "text") {
        await this.handleUnknownMessage(message);
        return;
      }

      if (this.pendingConfirmations.has(message.chatId)) {
        await this.handlePendingConfirmation(message);
        return;
      }

      const text = (message.text ?? "").trim();

      switch (text) {
        case "/start":
          await this.handleStartCommand(message);
          break;
        case "/list":
          await this.handleListCommand(message);
          break;
        case "/help":
          await this.handleHelpCommand(message);
          break;
        case "/lang":
          await this.handleLangCommand(message);
          break;
        default:
          await this.handleUnknownMessage(message);
      }
    } catch {
      await this.sendLocalizedMessage(message.chatId, "unknownCommand");
    }
  }

  private async routeCallback(message: IncomingMessage): Promise<void> {
    const callbackData = message.callbackData ?? "";

    if (callbackData.startsWith("consume:")) {
      await this.handleConsumeAction(message);
      return;
    }

    if (callbackData.startsWith("delete:")) {
      await this.handleDeleteAction(message);
      return;
    }

    if (callbackData.startsWith("lang:")) {
      await this.handleLangSelection(message);
      return;
    }

    await this.handleUnknownMessage(message);
  }

  private async handleStartCommand(message: IncomingMessage): Promise<void> {
    const hasPersistedLocale = await this.hasPersistedLocale(message.chatId);

    if (!hasPersistedLocale) {
      const welcomeText = this.i18n.t(message.chatId, "welcome");
      const selectLanguageText = this.i18n.t(message.chatId, "selectLanguage");
      await this.adapter.sendMessage(message.chatId, {
        text: `${welcomeText}\n\n${selectLanguageText}`,
        inlineKeyboard: this.buildLanguageKeyboard(),
      });
      return;
    }

    const welcomeText = this.i18n.t(message.chatId, "welcome");
    const helpText = this.i18n.t(message.chatId, "help");

    await this.adapter.sendMessage(message.chatId, {
      text: `${welcomeText}\n\n${helpText}`,
    });
  }

  private async handleHelpCommand(message: IncomingMessage): Promise<void> {
    await this.sendLocalizedMessage(message.chatId, "help");
  }

  private async handlePhotoMessage(message: IncomingMessage): Promise<void> {
    const { imageBuffer, imageMimeType } = message;

    if (!imageBuffer || !imageMimeType) {
      await this.sendLocalizedMessage(message.chatId, "extractionFailed");
      return;
    }

    await this.sendLocalizedMessage(message.chatId, "analyzingPhoto");

    const extraction = await this.vision.extractExpiryDate(imageBuffer, imageMimeType);

    if (!extraction.success) {
      await this.sendLocalizedMessage(message.chatId, "extractionFailed");
      return;
    }

    if (!extraction.expiryDate) {
      await this.sendLocalizedMessage(message.chatId, "noDateFound");
      return;
    }

    const productName =
      extraction.productName ?? extraction.rawDateText ?? extraction.expiryDate;

    if (extraction.confidence < LOW_CONFIDENCE_THRESHOLD) {
      this.setPendingConfirmation(message.chatId, {
        productName,
        expiryDate: extraction.expiryDate,
        confidence: extraction.confidence,
        rawDateText: extraction.rawDateText,
      });

      await this.sendLocalizedMessage(message.chatId, "confirmExtraction", {
        params: {
          productName,
          expiryDate: extraction.expiryDate,
          rawText: extraction.rawDateText ?? "",
        },
      });
      return;
    }

    await this.saveFoodItem(message.chatId, {
      productName,
      expiryDate: extraction.expiryDate,
      confidence: extraction.confidence,
    });
  }

  private async handleListCommand(message: IncomingMessage): Promise<void> {
    const items = await this.repository.getActiveItems(message.chatId);

    if (items.length === 0) {
      await this.sendLocalizedMessage(message.chatId, "noActiveItems");
      return;
    }

    const lines = items.map((item) =>
      this.i18n.t(message.chatId, "listItem", {
        productName: item.productName,
        expiryDate: item.expiryDate,
        daysUntil: this.computeDaysUntil(item.expiryDate),
      }),
    );

    const buttons = items.map((item) => [
      {
        text: this.i18n.t(message.chatId, "btnConsume"),
        callbackData: `consume:${item.id}`,
      },
      {
        text: this.i18n.t(message.chatId, "btnDelete"),
        callbackData: `delete:${item.id}`,
      },
    ]);

    await this.adapter.sendMessage(message.chatId, {
      text: `${this.i18n.t(message.chatId, "listHeader")}\n${lines.join("\n")}`,
      inlineKeyboard: buttons,
    });
  }

  private async handleConsumeAction(message: IncomingMessage): Promise<void> {
    const itemId = this.extractId(message.callbackData, "consume:");
    if (!itemId) {
      await this.handleUnknownMessage(message);
      return;
    }

    const item = await this.repository.getItemById(itemId);
    await this.repository.markConsumed(itemId);

    await this.sendLocalizedMessage(message.chatId, "itemConsumed", {
      params: {
        productName: item?.productName ?? itemId,
      },
    });
  }

  private async handleDeleteAction(message: IncomingMessage): Promise<void> {
    const itemId = this.extractId(message.callbackData, "delete:");
    if (!itemId) {
      await this.handleUnknownMessage(message);
      return;
    }

    const item = await this.repository.getItemById(itemId);
    await this.repository.deleteItem(itemId);

    await this.sendLocalizedMessage(message.chatId, "itemDeleted", {
      params: {
        productName: item?.productName ?? itemId,
      },
    });
  }

  private async handleLangCommand(message: IncomingMessage): Promise<void> {
    await this.sendLocalizedMessage(message.chatId, "selectLanguage", {
      inlineKeyboard: this.buildLanguageKeyboard(),
    });
  }

  private async handleLangSelection(message: IncomingMessage): Promise<void> {
    const localeRaw = this.extractId(message.callbackData, "lang:");
    if (!localeRaw || !this.isSupportedLocale(localeRaw)) {
      await this.handleUnknownMessage(message);
      return;
    }

    await this.i18n.setLocale(message.chatId, localeRaw);

    await this.sendLocalizedMessage(message.chatId, "languageChanged");
  }

  private async handleUnknownMessage(message: IncomingMessage): Promise<void> {
    await this.sendLocalizedMessage(message.chatId, "unknownCommand");
  }

  private async handlePendingConfirmation(message: IncomingMessage): Promise<void> {
    const confirmation = this.pendingConfirmations.get(message.chatId);
    if (!confirmation) {
      await this.handleUnknownMessage(message);
      return;
    }

    const normalized = (message.text ?? "").trim().toLowerCase();

    if (YES_TOKENS.has(normalized)) {
      this.clearPendingConfirmation(message.chatId);
      await this.saveFoodItem(message.chatId, {
        productName: confirmation.productName,
        expiryDate: confirmation.expiryDate,
        confidence: confirmation.confidence,
      });
      return;
    }

    if (NO_TOKENS.has(normalized)) {
      this.clearPendingConfirmation(message.chatId);
      await this.sendLocalizedMessage(message.chatId, "extractionFailed");
      return;
    }

    await this.sendLocalizedMessage(message.chatId, "confirmExtraction", {
      params: {
        productName: confirmation.productName,
        expiryDate: confirmation.expiryDate,
        rawText: confirmation.rawDateText ?? "",
      },
    });
  }

  private setPendingConfirmation(
    chatId: string,
    payload: Omit<PendingConfirmation, "timeoutId">,
  ): void {
    this.clearPendingConfirmation(chatId);

    const timeoutId = setTimeout(() => {
      this.pendingConfirmations.delete(chatId);
    }, CONFIRMATION_TTL_MS);

    this.pendingConfirmations.set(chatId, {
      ...payload,
      timeoutId,
    });
  }

  private clearPendingConfirmation(chatId: string): void {
    const existing = this.pendingConfirmations.get(chatId);
    if (!existing) {
      return;
    }

    clearTimeout(existing.timeoutId);
    this.pendingConfirmations.delete(chatId);
  }

  private async saveFoodItem(
    chatId: string,
    item: Pick<NewFoodItem, "productName" | "expiryDate" | "confidence">,
  ): Promise<void> {
    await this.repository.addItem({
      chatId,
      productName: item.productName,
      expiryDate: item.expiryDate,
      confidence: item.confidence,
    });

    await this.sendLocalizedMessage(chatId, "itemAdded", {
      params: {
        productName: item.productName,
        expiryDate: item.expiryDate,
      },
    });
  }

  private async hasPersistedLocale(chatId: string): Promise<boolean> {
    const locale = await this.repository.getLocale(chatId);
    return this.isSupportedLocale(locale);
  }

  private isSupportedLocale(locale: string): locale is Locale {
    return SUPPORTED_LOCALES.includes(locale as Locale);
  }

  private buildLanguageKeyboard(): InlineButton[][] {
    return [
      [{ text: "English 🇬🇧", callbackData: "lang:en" }],
      [{ text: "Українська 🇺🇦", callbackData: "lang:uk" }],
    ];
  }

  private extractId(value: string | null, prefix: string): string | null {
    if (!value || !value.startsWith(prefix)) {
      return null;
    }

    const parsed = value.slice(prefix.length).trim();
    return parsed.length > 0 ? parsed : null;
  }

  private computeDaysUntil(expiryDate: string): number {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(`${expiryDate}T00:00:00.000Z`);

    const diff = target.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  private async sendLocalizedMessage(
    chatId: string,
    key: string,
    options: {
      params?: Record<string, unknown>;
      inlineKeyboard?: InlineButton[][];
    } = {},
  ): Promise<void> {
    const text = this.i18n.t(chatId, key, options.params);

    await this.adapter.sendMessage(chatId, {
      text,
      inlineKeyboard: options.inlineKeyboard,
    });
  }
}

export { DEFAULT_LOCALE, LOW_CONFIDENCE_THRESHOLD, CONFIRMATION_TTL_MS };

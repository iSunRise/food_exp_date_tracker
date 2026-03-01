import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { BotEngine } from "../../src/bot/engine.js";
import type {
  BotAdapter,
  FoodRepository,
  I18nService,
  MessageHandler,
  CallbackQueryHandler,
  VisionService,
} from "../../src/shared/interfaces.js";
import type { FoodItem, IncomingMessage } from "../../src/shared/types.js";

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<A, R>>
    : T[K];
};

interface Harness {
  engine: BotEngine;
  adapter: Mocked<BotAdapter>;
  repository: Mocked<FoodRepository>;
  vision: Mocked<VisionService>;
  i18n: Mocked<I18nService>;
  triggerMessage: (message: Partial<IncomingMessage>) => Promise<void>;
  triggerCallback: (message: Partial<IncomingMessage>) => Promise<void>;
}

function createHarness(): Harness {
  let messageHandler: MessageHandler | undefined;
  let callbackHandler: CallbackQueryHandler | undefined;

  const adapter: Mocked<BotAdapter> = {
    onMessage: vi.fn((handler: MessageHandler) => {
      messageHandler = handler;
    }),
    onCallbackQuery: vi.fn((handler: CallbackQueryHandler) => {
      callbackHandler = handler;
    }),
    sendMessage: vi.fn(async () => undefined),
    sendAlert: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };

  const repository: Mocked<FoodRepository> = {
    addItem: vi.fn(async (item) => ({
      id: "item-1",
      chatId: item.chatId,
      productName: item.productName,
      expiryDate: item.expiryDate,
      imageUrl: null,
      status: "active",
      confidence: item.confidence ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getActiveItems: vi.fn(async () => []),
    getItemById: vi.fn(async () => null),
    markConsumed: vi.fn(async () => undefined),
    deleteItem: vi.fn(async () => undefined),
    getItemsExpiringBetween: vi.fn(async () => []),
    recordAlertSent: vi.fn(async () => undefined),
    getUnalertedItemsForDay: vi.fn(async () => []),
    getLocale: vi.fn(async () => "en"),
    setLocale: vi.fn(async () => undefined),
  };

  const vision: Mocked<VisionService> = {
    extractExpiryDate: vi.fn(async () => ({
      success: true,
      productName: "Milk",
      expiryDate: "2026-03-10",
      confidence: 0.95,
      rawDateText: "Best before 10/03/2026",
      notes: null,
      error: null,
    })),
  };

  const i18n: Mocked<I18nService> = {
    t: vi.fn((chatId: string, key: string, params?: Record<string, unknown>) =>
      JSON.stringify({ chatId, key, params: params ?? null }),
    ),
    setLocale: vi.fn(async () => undefined),
    getLocale: vi.fn(async () => "en"),
  };

  const engine = new BotEngine({
    adapter,
    vision,
    repository,
    i18n,
  });

  engine.start();

  return {
    engine,
    adapter,
    repository,
    vision,
    i18n,
    triggerMessage: async (message) => {
      if (!messageHandler) {
        throw new Error("message handler was not registered");
      }

      await messageHandler({
        id: "msg-1",
        chatId: "chat-1",
        type: "text",
        text: null,
        imageBuffer: null,
        imageMimeType: null,
        callbackData: null,
        ...message,
      });
    },
    triggerCallback: async (message) => {
      if (!callbackHandler) {
        throw new Error("callback handler was not registered");
      }

      await callbackHandler({
        id: "cb-1",
        chatId: "chat-1",
        type: "callback",
        text: null,
        imageBuffer: null,
        imageMimeType: null,
        callbackData: null,
        ...message,
      });
    },
  };
}

function parseTextPayload(text: string): { key: string; params: unknown } {
  const payload = JSON.parse(text) as { key: string; params: unknown };
  return { key: payload.key, params: payload.params };
}

function buildFoodItem(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: "item-1",
    chatId: "chat-1",
    productName: "Milk",
    expiryDate: "2026-03-10",
    imageUrl: null,
    status: "active",
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("BotEngine", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("registers adapter handlers on start", () => {
    const harness = createHarness();

    expect(harness.adapter.onMessage).toHaveBeenCalledTimes(1);
    expect(harness.adapter.onCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("handles /help command", async () => {
    const harness = createHarness();

    await harness.triggerMessage({ type: "text", text: "/help" });

    expect(harness.adapter.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(call[0]).toBe("chat-1");
    expect(parseTextPayload(call[1].text).key).toBe("help");
  });

  it("handles /start for first interaction with language selection", async () => {
    const harness = createHarness();

    harness.repository.getLocale.mockResolvedValueOnce("");

    await harness.triggerMessage({ type: "text", text: "/start" });

    expect(harness.adapter.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(call[1].text).toContain("\"key\":\"welcome\"");
    expect(call[1].text).toContain("\"key\":\"selectLanguage\"");
    expect(call[1].inlineKeyboard).toEqual([
      [{ text: "English 🇬🇧", callbackData: "lang:en" }],
      [{ text: "Українська 🇺🇦", callbackData: "lang:uk" }],
    ]);
  });

  it("handles /start for existing locale with welcome plus help", async () => {
    const harness = createHarness();

    harness.repository.getLocale.mockResolvedValueOnce("en");

    await harness.triggerMessage({ type: "text", text: "/start" });

    expect(harness.adapter.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(call[1].text).toContain("\"key\":\"welcome\"");
    expect(call[1].text).toContain("\"key\":\"help\"");
    expect(call[1].inlineKeyboard).toBeUndefined();
  });

  it("handles unknown text message", async () => {
    const harness = createHarness();

    await harness.triggerMessage({ type: "text", text: "random input" });

    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(parseTextPayload(call[1].text).key).toBe("unknownCommand");
  });

  it("handles /lang command with language keyboard", async () => {
    const harness = createHarness();

    await harness.triggerMessage({ type: "text", text: "/lang" });

    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(parseTextPayload(call[1].text).key).toBe("selectLanguage");
    expect(call[1].inlineKeyboard).toEqual([
      [{ text: "English 🇬🇧", callbackData: "lang:en" }],
      [{ text: "Українська 🇺🇦", callbackData: "lang:uk" }],
    ]);
  });

  it("handles language selection callback", async () => {
    const harness = createHarness();

    await harness.triggerCallback({ callbackData: "lang:uk" });

    expect(harness.i18n.setLocale).toHaveBeenCalledWith("chat-1", "uk");
    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(parseTextPayload(call[1].text).key).toBe("languageChanged");
  });

  it("handles high-confidence photo extraction and stores item", async () => {
    const harness = createHarness();

    await harness.triggerMessage({
      type: "photo",
      imageBuffer: Buffer.from("fake"),
      imageMimeType: "image/jpeg",
    });

    expect(harness.vision.extractExpiryDate).toHaveBeenCalledTimes(1);
    expect(harness.repository.addItem).toHaveBeenCalledWith({
      chatId: "chat-1",
      productName: "Milk",
      expiryDate: "2026-03-10",
      confidence: 0.95,
    });

    expect(harness.adapter.sendMessage).toHaveBeenCalledTimes(2);
    const analyzing = harness.adapter.sendMessage.mock.calls[0];
    const added = harness.adapter.sendMessage.mock.calls[1];
    expect(parseTextPayload(analyzing[1].text).key).toBe("analyzingPhoto");
    expect(parseTextPayload(added[1].text).key).toBe("itemAdded");
  });

  it("asks for confirmation on low-confidence extraction and saves on yes", async () => {
    const harness = createHarness();

    harness.vision.extractExpiryDate.mockResolvedValueOnce({
      success: true,
      productName: "Yogurt",
      expiryDate: "2026-04-01",
      confidence: 0.5,
      rawDateText: "EXP 01/04/2026",
      notes: null,
      error: null,
    });

    await harness.triggerMessage({
      type: "photo",
      imageBuffer: Buffer.from("fake"),
      imageMimeType: "image/jpeg",
    });

    const confirmation = harness.adapter.sendMessage.mock.calls[1];
    expect(parseTextPayload(confirmation[1].text).key).toBe("confirmExtraction");

    await harness.triggerMessage({ type: "text", text: "yes" });

    expect(harness.repository.addItem).toHaveBeenCalledWith({
      chatId: "chat-1",
      productName: "Yogurt",
      expiryDate: "2026-04-01",
      confidence: 0.5,
    });
    const finalCall = harness.adapter.sendMessage.mock.calls.at(-1);
    expect(finalCall).toBeDefined();
    expect(parseTextPayload(finalCall![1].text).key).toBe("itemAdded");
  });

  it("expires pending confirmation after five minutes", async () => {
    vi.useFakeTimers();

    const harness = createHarness();

    harness.vision.extractExpiryDate.mockResolvedValueOnce({
      success: true,
      productName: "Cheese",
      expiryDate: "2026-04-02",
      confidence: 0.4,
      rawDateText: "04/02/2026",
      notes: null,
      error: null,
    });

    await harness.triggerMessage({
      type: "photo",
      imageBuffer: Buffer.from("fake"),
      imageMimeType: "image/jpeg",
    });

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await harness.triggerMessage({ type: "text", text: "yes" });

    expect(harness.repository.addItem).not.toHaveBeenCalled();
    const finalCall = harness.adapter.sendMessage.mock.calls.at(-1);
    expect(finalCall).toBeDefined();
    expect(parseTextPayload(finalCall![1].text).key).toBe("unknownCommand");
  });

  it("returns extractionFailed when extraction fails", async () => {
    const harness = createHarness();

    harness.vision.extractExpiryDate.mockResolvedValueOnce({
      success: false,
      productName: null,
      expiryDate: null,
      confidence: 0,
      rawDateText: null,
      notes: null,
      error: "vision error",
    });

    await harness.triggerMessage({
      type: "photo",
      imageBuffer: Buffer.from("fake"),
      imageMimeType: "image/jpeg",
    });

    const finalCall = harness.adapter.sendMessage.mock.calls.at(-1);
    expect(finalCall).toBeDefined();
    expect(parseTextPayload(finalCall![1].text).key).toBe("extractionFailed");
  });

  it("formats list command with action buttons", async () => {
    const harness = createHarness();

    harness.repository.getActiveItems.mockResolvedValueOnce([
      buildFoodItem({ id: "item-a", productName: "Milk", expiryDate: "2026-03-10" }),
      buildFoodItem({ id: "item-b", productName: "Butter", expiryDate: "2026-03-12" }),
    ]);

    await harness.triggerMessage({ type: "text", text: "/list" });

    const call = harness.adapter.sendMessage.mock.calls[0];
    const [headerLine] = call[1].text.split("\n");
    expect(parseTextPayload(headerLine).key).toBe("listHeader");
    expect(call[1].text).toContain("\"key\":\"listItem\"");
    expect(call[1].inlineKeyboard).toEqual([
      [
        { text: JSON.stringify({ chatId: "chat-1", key: "btnConsume", params: null }), callbackData: "consume:item-a" },
        { text: JSON.stringify({ chatId: "chat-1", key: "btnDelete", params: null }), callbackData: "delete:item-a" },
      ],
      [
        { text: JSON.stringify({ chatId: "chat-1", key: "btnConsume", params: null }), callbackData: "consume:item-b" },
        { text: JSON.stringify({ chatId: "chat-1", key: "btnDelete", params: null }), callbackData: "delete:item-b" },
      ],
    ]);
  });

  it("handles consume and delete callbacks", async () => {
    const harness = createHarness();

    harness.repository.getItemById.mockResolvedValue(buildFoodItem({ id: "item-123", productName: "Kefir" }));

    await harness.triggerCallback({ callbackData: "consume:item-123" });
    await harness.triggerCallback({ callbackData: "delete:item-123" });

    expect(harness.repository.markConsumed).toHaveBeenCalledWith("item-123");
    expect(harness.repository.deleteItem).toHaveBeenCalledWith("item-123");

    const consumeCall = harness.adapter.sendMessage.mock.calls[0];
    const deleteCall = harness.adapter.sendMessage.mock.calls[1];
    expect(parseTextPayload(consumeCall[1].text).key).toBe("itemConsumed");
    expect(parseTextPayload(deleteCall[1].text).key).toBe("itemDeleted");
  });

  it("routes unknown callback actions to unknownCommand", async () => {
    const harness = createHarness();

    await harness.triggerCallback({ callbackData: "noop:item-1" });

    expect(harness.adapter.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.adapter.sendMessage.mock.calls[0];
    expect(parseTextPayload(call[1].text).key).toBe("unknownCommand");
  });
});

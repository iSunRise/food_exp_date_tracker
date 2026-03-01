import { describe, expect, it, vi } from "vitest";

import { TelegramAdapter } from "../../src/adapters/telegram.js";
import type { IncomingMessage } from "../../src/shared/types.js";

type SupportedUpdateType = "message:text" | "message:photo" | "callback_query:data";
type UpdateHandler = (ctx: Record<string, unknown>) => Promise<void>;

interface Harness {
  adapter: TelegramAdapter;
  handlers: Partial<Record<SupportedUpdateType, UpdateHandler>>;
  sendMessage: ReturnType<typeof vi.fn>;
  getFile: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  fetchImpl: ReturnType<typeof vi.fn>;
  logger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

function createArrayBuffer(contents: string): ArrayBuffer {
  const buffer = Buffer.from(contents);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function createHarness(): Harness {
  const handlers: Partial<Record<SupportedUpdateType, UpdateHandler>> = {};

  const sendMessage = vi.fn(async () => ({}));
  const getFile = vi.fn(async () => ({ file_path: "photos/picture.jpg" }));
  const getMe = vi.fn(async () => ({ id: 999, username: "food_bot" }));
  const start = vi.fn(async () => undefined);
  const stop = vi.fn(() => undefined);
  const answerCallbackQuery = vi.fn(async () => undefined);
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => createArrayBuffer("fake-image"),
  }));

  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  const bot = {
    on: vi.fn((updateType: SupportedUpdateType, handler: UpdateHandler) => {
      handlers[updateType] = handler;
    }),
    catch: vi.fn(),
    start,
    stop,
    api: {
      getFile,
      getMe,
      sendMessage,
    },
  };

  const adapter = new TelegramAdapter({
    token: "test-token",
    bot: bot as never,
    fetchImpl,
    logger,
  });

  return {
    adapter,
    handlers,
    sendMessage,
    getFile,
    getMe,
    start,
    stop,
    answerCallbackQuery,
    fetchImpl,
    logger,
  };
}

function expectIncomingMessage(message: IncomingMessage, partial: Partial<IncomingMessage>) {
  expect(message).toMatchObject(partial);
}

describe("TelegramAdapter", () => {
  it("translates text messages to IncomingMessage", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => undefined);

    harness.adapter.onMessage(handler);

    const textHandler = harness.handlers["message:text"];
    expect(textHandler).toBeTypeOf("function");

    await textHandler!({
      chat: { id: 12345 },
      message: {
        message_id: 77,
        text: "/start",
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expectIncomingMessage(handler.mock.calls[0][0], {
      id: "77",
      chatId: "12345",
      type: "text",
      text: "/start",
      imageBuffer: null,
      imageMimeType: null,
      callbackData: null,
    });
  });

  it("translates photo messages and downloads largest image", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => undefined);

    harness.adapter.onMessage(handler);

    const photoHandler = harness.handlers["message:photo"];
    expect(photoHandler).toBeTypeOf("function");

    await photoHandler!({
      chat: { id: 50 },
      api: {
        getFile: harness.getFile,
      },
      message: {
        message_id: 88,
        caption: "Milk",
        photo: [{ file_id: "small" }, { file_id: "large" }],
      },
    });

    expect(harness.getFile).toHaveBeenCalledWith("large");
    expect(harness.fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/file/bottest-token/photos/picture.jpg",
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const message = handler.mock.calls[0][0] as IncomingMessage;
    expectIncomingMessage(message, {
      id: "88",
      chatId: "50",
      type: "photo",
      text: "Milk",
      imageMimeType: "image/jpeg",
      callbackData: null,
    });
    expect(message.imageBuffer).toBeInstanceOf(Buffer);
    expect(message.imageBuffer?.toString()).toBe("fake-image");
  });

  it("keeps photo payload nullable when download fails", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => undefined);

    harness.fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      arrayBuffer: async () => createArrayBuffer(""),
    });

    harness.adapter.onMessage(handler);
    const photoHandler = harness.handlers["message:photo"];

    await photoHandler!({
      chat: { id: 44 },
      api: {
        getFile: harness.getFile,
      },
      message: {
        message_id: 111,
        photo: [{ file_id: "photo-1" }],
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expectIncomingMessage(handler.mock.calls[0][0], {
      id: "111",
      chatId: "44",
      type: "photo",
      imageBuffer: null,
      imageMimeType: null,
    });
    expect(harness.logger.error).toHaveBeenCalled();
  });

  it("translates callback queries and answers them", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => undefined);

    harness.adapter.onCallbackQuery(handler);

    const callbackHandler = harness.handlers["callback_query:data"];
    expect(callbackHandler).toBeTypeOf("function");

    await callbackHandler!({
      callbackQuery: {
        id: "cb-1",
        data: "consume:item-9",
        message: {
          chat: { id: 901 },
        },
      },
      answerCallbackQuery: harness.answerCallbackQuery,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expectIncomingMessage(handler.mock.calls[0][0], {
      id: "cb-1",
      chatId: "901",
      type: "callback",
      callbackData: "consume:item-9",
      text: null,
      imageBuffer: null,
      imageMimeType: null,
    });
    expect(harness.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("maps sendMessage options to Telegram API", async () => {
    const harness = createHarness();

    await harness.adapter.sendMessage("123", {
      text: "Hello",
      parseMode: "HTML",
      inlineKeyboard: [
        [
          { text: "Consume", callbackData: "consume:item-1" },
          { text: "Delete", callbackData: "delete:item-1" },
        ],
      ],
      replyToMessageId: "42",
    });

    expect(harness.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.sendMessage.mock.calls[0];
    expect(call[0]).toBe("123");
    expect(call[1]).toBe("Hello");
    expect(call[2]).toMatchObject({
      parse_mode: "HTML",
      reply_parameters: { message_id: 42 },
    });
    expect(call[2]?.reply_markup?.inline_keyboard).toEqual([
      [
        { text: "Consume", callback_data: "consume:item-1" },
        { text: "Delete", callback_data: "delete:item-1" },
      ],
    ]);
  });

  it("formats and sends alerts with consume button", async () => {
    const harness = createHarness();

    await harness.adapter.sendAlert("555", {
      foodItemId: "item-55",
      productName: "Yogurt",
      expiryDate: "2026-03-10",
      daysUntilExpiry: 2,
    });

    expect(harness.sendMessage).toHaveBeenCalledTimes(1);
    const call = harness.sendMessage.mock.calls[0];
    expect(call[0]).toBe("555");
    expect(call[1]).toContain("⚠️ Yogurt expires in 2 day(s)!");
    expect(call[1]).toContain("Expiry date: 2026-03-10");
    expect(call[2]?.reply_markup?.inline_keyboard).toEqual([
      [{ text: "Mark Consumed", callback_data: "consume:item-55" }],
    ]);
  });

  it("starts polling and logs bot identity", async () => {
    const harness = createHarness();

    await harness.adapter.start();

    expect(harness.getMe).toHaveBeenCalledTimes(1);
    expect(harness.start).toHaveBeenCalledTimes(1);
    expect(harness.logger.info).toHaveBeenCalledWith("Telegram bot started as @food_bot");
  });

  it("stops polling", async () => {
    const harness = createHarness();

    await harness.adapter.stop();

    expect(harness.stop).toHaveBeenCalledTimes(1);
  });
});

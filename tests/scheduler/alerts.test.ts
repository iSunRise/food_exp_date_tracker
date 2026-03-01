import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlertScheduler } from "../../src/scheduler/alerts.js";
import type { BotAdapter, FoodRepository, I18nService } from "../../src/shared/interfaces.js";
import type { FoodItem } from "../../src/shared/types.js";

const { scheduleMock, taskStopMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  taskStopMock: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: scheduleMock,
  },
}));

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<A, R>>
    : T[K];
};

interface Harness {
  repository: Mocked<FoodRepository>;
  adapter: Mocked<BotAdapter>;
  i18n: Mocked<I18nService>;
  scheduler: AlertScheduler;
}

function createFoodItem(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: "item-1",
    chatId: "chat-1",
    productName: "Milk",
    expiryDate: "2026-03-03",
    imageUrl: null,
    status: "active",
    confidence: 0.9,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createHarness(cronSchedule = "0 9 * * *"): Harness {
  const repository: Mocked<FoodRepository> = {
    addItem: vi.fn(async (item) => ({
      id: "item-created",
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

  const adapter: Mocked<BotAdapter> = {
    onMessage: vi.fn(() => undefined),
    onCallbackQuery: vi.fn(() => undefined),
    sendMessage: vi.fn(async () => undefined),
    sendAlert: vi.fn(async () => undefined),
    sendPhoto: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };

  const i18n: Mocked<I18nService> = {
    t: vi.fn((chatId: string, key: string, params?: Record<string, unknown>) => {
      if (key === "expiryAlert") {
        return `expiry:${chatId}:${String(params?.productName)}:${String(params?.daysUntil)}`;
      }

      if (key === "btnConsume") {
        return `consume:${chatId}`;
      }

      return key;
    }),
    setLocale: vi.fn(async () => undefined),
    getLocale: vi.fn(async () => "en"),
  };

  scheduleMock.mockReturnValue({
    stop: taskStopMock,
  });

  const scheduler = new AlertScheduler(repository, adapter, i18n, cronSchedule);

  return {
    repository,
    adapter,
    i18n,
    scheduler,
  };
}

describe("AlertScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sends alerts for items across all thresholds and records sent alerts", async () => {
    const harness = createHarness();
    const itemsByThreshold: Record<number, FoodItem[]> = {
      3: [createFoodItem({ id: "item-3", productName: "Milk", expiryDate: "2026-03-03" })],
      2: [
        createFoodItem({
          id: "item-2",
          chatId: "chat-2",
          productName: "Cheese",
          expiryDate: "2026-03-02",
        }),
      ],
      1: [createFoodItem({ id: "item-1", productName: "Eggs", expiryDate: "2026-03-01" })],
    };

    harness.repository.getUnalertedItemsForDay.mockImplementation(
      async (_targetDate, daysBeforeExpiry) => itemsByThreshold[daysBeforeExpiry] ?? [],
    );

    await harness.scheduler.checkAndAlert();

    expect(harness.repository.getUnalertedItemsForDay).toHaveBeenCalledTimes(3);

    const calls = harness.repository.getUnalertedItemsForDay.mock.calls;
    expect(calls[0][1]).toBe(3);
    expect(calls[0][0].toISOString().slice(0, 10)).toBe("2026-03-03");
    expect(calls[1][1]).toBe(2);
    expect(calls[1][0].toISOString().slice(0, 10)).toBe("2026-03-02");
    expect(calls[2][1]).toBe(1);
    expect(calls[2][0].toISOString().slice(0, 10)).toBe("2026-03-01");

    expect(harness.adapter.sendAlert).toHaveBeenCalledTimes(3);
    expect(harness.repository.recordAlertSent).toHaveBeenCalledTimes(3);

    expect(harness.adapter.sendAlert).toHaveBeenNthCalledWith(
      1,
      "chat-1",
      expect.objectContaining({
        foodItemId: "item-3",
        daysUntilExpiry: 3,
        localizedText: "expiry:chat-1:Milk:3",
        localizedConsumeLabel: "consume:chat-1",
      }),
    );
    expect(harness.adapter.sendAlert).toHaveBeenNthCalledWith(
      2,
      "chat-2",
      expect.objectContaining({
        foodItemId: "item-2",
        daysUntilExpiry: 2,
        localizedText: "expiry:chat-2:Cheese:2",
        localizedConsumeLabel: "consume:chat-2",
      }),
    );
    expect(harness.adapter.sendAlert).toHaveBeenNthCalledWith(
      3,
      "chat-1",
      expect.objectContaining({
        foodItemId: "item-1",
        daysUntilExpiry: 1,
        localizedText: "expiry:chat-1:Eggs:1",
        localizedConsumeLabel: "consume:chat-1",
      }),
    );

    expect(harness.repository.recordAlertSent).toHaveBeenNthCalledWith(1, "item-3", 3);
    expect(harness.repository.recordAlertSent).toHaveBeenNthCalledWith(2, "item-2", 2);
    expect(harness.repository.recordAlertSent).toHaveBeenNthCalledWith(3, "item-1", 1);
  });

  it("records alert only after successful send", async () => {
    const harness = createHarness();
    const order: string[] = [];

    harness.repository.getUnalertedItemsForDay.mockResolvedValueOnce([
      createFoodItem({ id: "item-seq" }),
    ]);
    harness.adapter.sendAlert.mockImplementation(async () => {
      order.push("send");
    });
    harness.repository.recordAlertSent.mockImplementation(async () => {
      order.push("record");
    });

    await harness.scheduler.checkAndAlert();

    expect(order).toEqual(["send", "record"]);
  });

  it("continues processing items when one send fails", async () => {
    const harness = createHarness();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    harness.repository.getUnalertedItemsForDay.mockImplementation(
      async (_targetDate, daysBeforeExpiry) => {
        if (daysBeforeExpiry !== 3) {
          return [];
        }

        return [
          createFoodItem({ id: "item-fail", productName: "Yogurt" }),
          createFoodItem({ id: "item-ok", productName: "Butter" }),
        ];
      },
    );

    harness.adapter.sendAlert
      .mockRejectedValueOnce(new Error("telegram unavailable"))
      .mockResolvedValueOnce(undefined);

    await harness.scheduler.checkAndAlert();

    expect(harness.adapter.sendAlert).toHaveBeenCalledTimes(2);
    expect(harness.repository.recordAlertSent).toHaveBeenCalledTimes(1);
    expect(harness.repository.recordAlertSent).toHaveBeenCalledWith("item-ok", 3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("aborts the current tick when repository operation fails", async () => {
    const harness = createHarness();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    harness.repository.getUnalertedItemsForDay.mockResolvedValueOnce([
      createFoodItem({ id: "item-repo" }),
    ]);
    harness.repository.recordAlertSent.mockRejectedValueOnce(new Error("db error"));

    await harness.scheduler.checkAndAlert();

    expect(harness.repository.getUnalertedItemsForDay).toHaveBeenCalledTimes(1);
    expect(harness.adapter.sendAlert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("starts cron only once and stops cleanly", async () => {
    const harness = createHarness("*/5 * * * *");
    const checkSpy = vi
      .spyOn(harness.scheduler, "checkAndAlert")
      .mockResolvedValueOnce(undefined);

    harness.scheduler.start();
    harness.scheduler.start();

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));

    const tick = scheduleMock.mock.calls[0][1] as () => void;
    tick();
    await Promise.resolve();

    expect(checkSpy).toHaveBeenCalledTimes(1);

    harness.scheduler.stop();
    harness.scheduler.stop();

    expect(taskStopMock).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FoodRepository } from "../../src/shared/interfaces.js";
import { DefaultI18nService } from "../../src/i18n/index.js";
import { en } from "../../src/i18n/locales/en.js";
import { uk } from "../../src/i18n/locales/uk.js";

type MockLocaleRepository = Pick<FoodRepository, "getLocale" | "setLocale">;

describe("DefaultI18nService", () => {
  let repository: MockLocaleRepository;
  let service: DefaultI18nService;

  beforeEach(() => {
    repository = {
      getLocale: vi.fn<MockLocaleRepository["getLocale"]>().mockResolvedValue("en"),
      setLocale: vi.fn<MockLocaleRepository["setLocale"]>().mockResolvedValue(),
    };

    service = new DefaultI18nService(repository);
  });

  it("keeps locale keys aligned between English and Ukrainian maps", () => {
    const englishKeys = Object.keys(en).sort();
    const ukrainianKeys = Object.keys(uk).sort();

    expect(ukrainianKeys).toEqual(englishKeys);
  });

  it("returns English translations by default", () => {
    expect(service.t("chat-1", "welcome")).toBe(
      "Welcome to Food Expiration Date Tracker.",
    );
  });

  it("returns Ukrainian translations after locale is set", async () => {
    await service.setLocale("chat-1", "uk");

    expect(service.t("chat-1", "welcome")).toBe(
      "Ласкаво просимо до трекера терміну придатності продуктів.",
    );
    expect(repository.setLocale).toHaveBeenCalledWith("chat-1", "uk");
  });

  it("interpolates function-based translations", async () => {
    await service.setLocale("chat-1", "en");

    expect(
      service.t("chat-1", "itemAdded", {
        productName: "Milk",
        expiryDate: "2026-03-03",
      }),
    ).toBe('Added "Milk" with expiry date 2026-03-03.');
  });

  it("loads locale from persistence and caches it", async () => {
    repository.getLocale = vi
      .fn<MockLocaleRepository["getLocale"]>()
      .mockResolvedValue("uk");

    service = new DefaultI18nService(repository);

    await expect(service.getLocale("chat-2")).resolves.toBe("uk");
    await expect(service.getLocale("chat-2")).resolves.toBe("uk");

    expect(repository.getLocale).toHaveBeenCalledTimes(1);
    expect(service.t("chat-2", "btnConsume")).toBe("Спожито");
  });

  it("falls back to English when persisted locale is unsupported", async () => {
    repository.getLocale = vi
      .fn<MockLocaleRepository["getLocale"]>()
      .mockResolvedValue("de");

    service = new DefaultI18nService(repository);

    await expect(service.getLocale("chat-3")).resolves.toBe("en");
    expect(service.t("chat-3", "btnConsume")).toBe("Consumed");
  });
});

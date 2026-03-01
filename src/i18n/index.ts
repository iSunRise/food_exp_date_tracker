import type { FoodRepository, I18nService } from "../shared/interfaces.js";

import { en } from "./locales/en.js";
import { uk } from "./locales/uk.js";

export type Locale = "en" | "uk";

export interface TranslationMap {
  // General
  welcome: string;
  help: string;
  unknownCommand: string;

  // Photo processing
  analyzingPhoto: string;
  extractionFailed: string;
  noDateFound: string;
  noPhotoAvailable: string;
  photoCaption: (params: { productName: string; expiryDate: string }) => string;
  photoUploadFailed: string;
  confirmExtraction: (params: {
    productName: string;
    expiryDate: string;
    rawText: string;
  }) => string;
  itemAdded: (params: { productName: string; expiryDate: string }) => string;

  // List
  noActiveItems: string;
  listHeader: string;
  listItem: (params: {
    productName: string;
    expiryDate: string;
    daysUntil: number;
  }) => string;

  // Actions
  itemConsumed: (params: { productName: string }) => string;
  itemDeleted: (params: { productName: string }) => string;

  // Alerts
  expiryAlert: (params: {
    productName: string;
    expiryDate: string;
    daysUntil: number;
  }) => string;

  // Buttons
  btnConsume: string;
  btnDelete: string;
  btnPhoto: string;
  btnYes: string;
  btnNo: string;

  // Language
  selectLanguage: string;
  languageChanged: string;
}

export type TranslationKey = keyof TranslationMap;

type LocaleRepository = Pick<FoodRepository, "getLocale" | "setLocale">;

const DEFAULT_LOCALE: Locale = "en";
const TRANSLATIONS: Record<Locale, TranslationMap> = {
  en,
  uk,
};

function isLocale(locale: string): locale is Locale {
  return locale === "en" || locale === "uk";
}

export class DefaultI18nService implements I18nService {
  private readonly localeCache = new Map<string, Locale>();

  constructor(private readonly repository: LocaleRepository) {}

  t(chatId: string, key: string, params?: Record<string, unknown>): string {
    const locale = this.localeCache.get(chatId) ?? DEFAULT_LOCALE;

    if (!this.localeCache.has(chatId)) {
      void this.getLocale(chatId);
    }

    return this.renderTranslation(locale, key, params);
  }

  async setLocale(chatId: string, locale: Locale): Promise<void> {
    this.localeCache.set(chatId, locale);
    await this.repository.setLocale(chatId, locale);
  }

  async getLocale(chatId: string): Promise<Locale> {
    const cachedLocale = this.localeCache.get(chatId);
    if (cachedLocale) {
      return cachedLocale;
    }

    const persistedLocale = await this.repository.getLocale(chatId);
    const locale = isLocale(persistedLocale) ? persistedLocale : DEFAULT_LOCALE;

    this.localeCache.set(chatId, locale);
    return locale;
  }

  private renderTranslation(
    locale: Locale,
    key: string,
    params?: Record<string, unknown>,
  ): string {
    const normalizedKey = key as TranslationKey;
    const value = TRANSLATIONS[locale][normalizedKey];

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "function") {
      return (value as (args: Record<string, unknown>) => string)(params ?? {});
    }

    const fallback = TRANSLATIONS[DEFAULT_LOCALE][normalizedKey];

    if (typeof fallback === "string") {
      return fallback;
    }

    if (typeof fallback === "function") {
      return (fallback as (args: Record<string, unknown>) => string)(params ?? {});
    }

    return key;
  }
}

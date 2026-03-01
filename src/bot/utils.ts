import type { Locale } from "../shared/interfaces.js";
import type { InlineButton } from "../shared/types.js";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: Locale[] = ["en", "uk"];

export const YES_TOKENS = new Set(["yes", "y", "tak", "так", "да"]);
export const NO_TOKENS = new Set(["no", "n", "ni", "ні", "нет"]);

export function extractId(value: string | null, prefix: string): string | null {
  if (!value || !value.startsWith(prefix)) {
    return null;
  }

  const parsed = value.slice(prefix.length).trim();
  return parsed.length > 0 ? parsed : null;
}

export function computeDaysUntil(expiryDate: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${expiryDate}T00:00:00.000Z`);

  const diff = target.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function buildLanguageKeyboard(): InlineButton[][] {
  return [
    [{ text: "English 🇬🇧", callbackData: "lang:en" }],
    [{ text: "Українська 🇺🇦", callbackData: "lang:uk" }],
  ];
}

export function isSupportedLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

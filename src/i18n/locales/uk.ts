import type { TranslationMap } from "../index.js";

import { pluralizeDayUk } from "./pluralization.js";

export const uk = {
  // General
  welcome: "Ласкаво просимо до трекера терміну придатності продуктів.",
  help: [
    "Надішліть фото етикетки продукту, і я відстежу термін придатності.",
    "",
    "Команди:",
    "/list - Показати активні продукти",
    "/lang - Змінити мову",
    "/help - Показати цю довідку",
  ].join("\n"),
  unknownCommand:
    "Я не зрозумів цю команду. Надішліть фото етикетки або використайте /help.",

  // Photo processing
  analyzingPhoto: "Аналізую етикетку продукту...",
  extractionFailed:
    "Не вдалося зчитати дату придатності. Спробуйте зробити фото ще раз при кращому освітленні.",
  noDateFound: "Не вдалося знайти дату придатності на цьому фото.",
  confirmExtraction: ({ productName, expiryDate, rawText }) =>
    [
      "Підтвердьте знайдені дані:",
      `Продукт: ${productName}`,
      `Термін придатності: ${expiryDate}`,
      `Сирий фрагмент дати: ${rawText}`,
    ].join("\n"),
  itemAdded: ({ productName, expiryDate }) =>
    `Додано \"${productName}\" з датою придатності ${expiryDate}.`,

  // List
  noActiveItems: "У вас немає активних продуктів для відстеження.",
  listHeader: "Відстежувані продукти:",
  listItem: ({ productName, expiryDate, daysUntil }) =>
    `${productName} - придатний до ${expiryDate} (залишилось ${daysUntil} ${pluralizeDayUk(daysUntil)})`,

  // Actions
  itemConsumed: ({ productName }) => `Позначено \"${productName}\" як спожитий.`,
  itemDeleted: ({ productName }) =>
    `Видалено \"${productName}\" з відстеження.`,

  // Alerts
  expiryAlert: ({ productName, expiryDate, daysUntil }) =>
    `Нагадування: \"${productName}\" має термін придатності до ${expiryDate} (залишилось ${daysUntil} ${pluralizeDayUk(daysUntil)}).`,

  // Buttons
  btnConsume: "Спожито",
  btnDelete: "Видалити",
  btnYes: "Так",
  btnNo: "Ні",

  // Language
  selectLanguage: "Оберіть мову:",
  languageChanged: "Мову оновлено.",
} satisfies TranslationMap;

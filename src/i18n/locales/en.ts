import type { TranslationMap } from "../index.js";

import { pluralizeDayEn } from "./pluralization.js";

export const en = {
  // General
  welcome: "Welcome to Food Expiration Date Tracker.",
  help: [
    "Send me a photo of a food label and I will track the expiration date.",
    "",
    "Commands:",
    "/list - Show active tracked items",
    "/lang - Change language",
    "/help - Show this help message",
  ].join("\n"),
  unknownCommand:
    "I did not understand that. Send a photo of a food label or use /help.",

  // Photo processing
  analyzingPhoto: "Analyzing your food label...",
  extractionFailed:
    "I could not read the expiration date. Please retake the photo with better lighting.",
  noDateFound: "I could not find an expiration date in this photo.",
  confirmExtraction: ({ productName, expiryDate, rawText }) =>
    [
      "Please confirm the extracted details:",
      `Product: ${productName}`,
      `Expiry date: ${expiryDate}`,
      `Raw date text: ${rawText}`,
    ].join("\n"),
  itemAdded: ({ productName, expiryDate }) =>
    `Added \"${productName}\" with expiry date ${expiryDate}.`,

  // List
  noActiveItems: "You have no active tracked items.",
  listHeader: "Tracked food items:",
  listItem: ({ productName, expiryDate, daysUntil }) =>
    `${productName} - expires ${expiryDate} (${daysUntil} ${pluralizeDayEn(daysUntil)})`,

  // Actions
  itemConsumed: ({ productName }) => `Marked \"${productName}\" as consumed.`,
  itemDeleted: ({ productName }) => `Deleted \"${productName}\" from tracking.`,

  // Alerts
  expiryAlert: ({ productName, expiryDate, daysUntil }) =>
    `Reminder: \"${productName}\" expires on ${expiryDate} (${daysUntil} ${pluralizeDayEn(daysUntil)} left).`,

  // Buttons
  btnConsume: "Consumed",
  btnDelete: "Delete",
  btnYes: "Yes",
  btnNo: "No",

  // Language
  selectLanguage: "Choose your language:",
  languageChanged: "Language updated.",
} satisfies TranslationMap;

import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { buildLanguageKeyboard, extractId, isSupportedLocale } from "../utils.js";

export const langCommandHandler: BotHandler = {
  name: "lang-command",

  match(message: IncomingMessage): boolean {
    return message.type === "text" && (message.text ?? "").trim() === "/lang";
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    await ctx.sendLocalized(message.chatId, "selectLanguage", {
      inlineKeyboard: buildLanguageKeyboard(),
    });
  },
};

export const langSelectionHandler: BotHandler = {
  name: "lang-selection",

  match(message: IncomingMessage): boolean {
    return (
      message.type === "callback" &&
      (message.callbackData ?? "").startsWith("lang:")
    );
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const localeRaw = extractId(message.callbackData, "lang:");
    if (!localeRaw || !isSupportedLocale(localeRaw)) {
      await ctx.sendLocalized(message.chatId, "unknownCommand");
      return;
    }

    await ctx.i18n.setLocale(message.chatId, localeRaw);
    await ctx.sendLocalized(message.chatId, "languageChanged");
  },
};

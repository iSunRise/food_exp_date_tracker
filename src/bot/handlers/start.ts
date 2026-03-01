import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { buildLanguageKeyboard, isSupportedLocale } from "../utils.js";

export const startHandler: BotHandler = {
  name: "start",

  match(message: IncomingMessage): boolean {
    return message.type === "text" && (message.text ?? "").trim() === "/start";
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const persistedLocale = await ctx.repository.getLocale(message.chatId);
    const hasLocale = isSupportedLocale(persistedLocale);

    if (!hasLocale) {
      const welcomeText = ctx.i18n.t(message.chatId, "welcome");
      const selectLanguageText = ctx.i18n.t(message.chatId, "selectLanguage");
      await ctx.adapter.sendMessage(message.chatId, {
        text: `${welcomeText}\n\n${selectLanguageText}`,
        inlineKeyboard: buildLanguageKeyboard(),
      });
      return;
    }

    const welcomeText = ctx.i18n.t(message.chatId, "welcome");
    const helpText = ctx.i18n.t(message.chatId, "help");
    await ctx.adapter.sendMessage(message.chatId, {
      text: `${welcomeText}\n\n${helpText}`,
    });
  },
};

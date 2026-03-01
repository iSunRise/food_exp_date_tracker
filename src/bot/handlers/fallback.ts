import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";

export const fallbackHandler: BotHandler = {
  name: "fallback",

  match(): boolean {
    return true;
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    await ctx.sendLocalized(message.chatId, "unknownCommand");
  },
};

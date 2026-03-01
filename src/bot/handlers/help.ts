import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";

export const helpHandler: BotHandler = {
  name: "help",

  match(message: IncomingMessage): boolean {
    return message.type === "text" && (message.text ?? "").trim() === "/help";
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    await ctx.sendLocalized(message.chatId, "help");
  },
};

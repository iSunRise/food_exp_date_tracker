import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { computeDaysUntil } from "../utils.js";

export const listHandler: BotHandler = {
  name: "list",

  match(message: IncomingMessage): boolean {
    return message.type === "text" && (message.text ?? "").trim() === "/list";
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const items = await ctx.repository.getActiveItems(message.chatId);

    if (items.length === 0) {
      await ctx.sendLocalized(message.chatId, "noActiveItems");
      return;
    }

    const lines = items.map((item) =>
      ctx.i18n.t(message.chatId, "listItem", {
        productName: item.productName,
        expiryDate: item.expiryDate,
        daysUntil: computeDaysUntil(item.expiryDate),
      }),
    );

    const buttons = items.map((item) => [
      {
        text: ctx.i18n.t(message.chatId, "btnConsume"),
        callbackData: `consume:${item.id}`,
      },
      {
        text: ctx.i18n.t(message.chatId, "btnDelete"),
        callbackData: `delete:${item.id}`,
      },
    ]);

    await ctx.adapter.sendMessage(message.chatId, {
      text: `${ctx.i18n.t(message.chatId, "listHeader")}\n${lines.join("\n")}`,
      inlineKeyboard: buttons,
    });
  },
};

import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { extractId } from "../utils.js";

export const consumeHandler: BotHandler = {
  name: "consume",

  match(message: IncomingMessage): boolean {
    return (
      message.type === "callback" &&
      (message.callbackData ?? "").startsWith("consume:")
    );
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const itemId = extractId(message.callbackData, "consume:");
    if (!itemId) {
      await ctx.sendLocalized(message.chatId, "unknownCommand");
      return;
    }

    const item = await ctx.repository.getItemById(itemId);
    await ctx.repository.markConsumed(itemId);

    await ctx.sendLocalized(message.chatId, "itemConsumed", {
      params: {
        productName: item?.productName ?? itemId,
      },
    });
  },
};

import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { extractId } from "../utils.js";

export const deleteHandler: BotHandler = {
  name: "delete",

  match(message: IncomingMessage): boolean {
    return (
      message.type === "callback" &&
      (message.callbackData ?? "").startsWith("delete:")
    );
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const itemId = extractId(message.callbackData, "delete:");
    if (!itemId) {
      await ctx.sendLocalized(message.chatId, "unknownCommand");
      return;
    }

    const item = await ctx.repository.getItemById(itemId);
    await ctx.repository.deleteItem(itemId);

    if (item?.imageUrl) {
      try {
        await ctx.imageStorage.delete(item.imageUrl);
      } catch (error) {
        console.error(`Failed to delete image for item ${itemId}`, error);
      }
    }

    await ctx.sendLocalized(message.chatId, "itemDeleted", {
      params: {
        productName: item?.productName ?? itemId,
      },
    });
  },
};

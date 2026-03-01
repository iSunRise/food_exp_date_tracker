import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { extractId } from "../utils.js";

export const photoViewHandler: BotHandler = {
  name: "photoView",

  match(message: IncomingMessage): boolean {
    return (
      message.type === "callback" &&
      (message.callbackData ?? "").startsWith("photo:")
    );
  },

  async handle(message: IncomingMessage, ctx): Promise<void> {
    const itemId = extractId(message.callbackData, "photo:");
    if (!itemId) {
      await ctx.sendLocalized(message.chatId, "unknownCommand");
      return;
    }

    const item = await ctx.repository.getItemById(itemId);
    if (!item || !item.imageUrl) {
      await ctx.sendLocalized(message.chatId, "noPhotoAvailable");
      return;
    }

    let url: string;

    try {
      url = await ctx.imageStorage.getUrl(item.imageUrl);
    } catch {
      await ctx.sendLocalized(message.chatId, "noPhotoAvailable");
      return;
    }

    const caption = ctx.i18n.t(message.chatId, "photoCaption", {
      productName: item.productName,
      expiryDate: item.expiryDate,
    });

    await ctx.adapter.sendPhoto(message.chatId, url, caption);
  },
};

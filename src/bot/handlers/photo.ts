import { randomUUID } from "node:crypto";

import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import type { ConfirmationStore } from "./confirmation.js";
import { LOW_CONFIDENCE_THRESHOLD } from "../utils.js";

export function createPhotoHandler(confirmationStore: ConfirmationStore): BotHandler {
  return {
    name: "photo",

    match(message: IncomingMessage): boolean {
      return message.type === "photo";
    },

    async handle(message: IncomingMessage, ctx): Promise<void> {
      const { imageBuffer, imageMimeType } = message;

      if (!imageBuffer || !imageMimeType) {
        await ctx.sendLocalized(message.chatId, "extractionFailed");
        return;
      }

      await ctx.sendLocalized(message.chatId, "analyzingPhoto");

      const extraction = await ctx.vision.extractExpiryDate(imageBuffer, imageMimeType);

      if (!extraction.success) {
        await ctx.sendLocalized(message.chatId, "extractionFailed");
        return;
      }

      if (!extraction.expiryDate) {
        await ctx.sendLocalized(message.chatId, "noDateFound");
        return;
      }

      const productName =
        extraction.productName ?? extraction.rawDateText ?? extraction.expiryDate;

      if (extraction.confidence < LOW_CONFIDENCE_THRESHOLD) {
        confirmationStore.set(message.chatId, {
          productName,
          expiryDate: extraction.expiryDate,
          confidence: extraction.confidence,
          rawDateText: extraction.rawDateText,
          imageBuffer,
          imageMimeType,
        });

        await ctx.sendLocalized(message.chatId, "confirmExtraction", {
          params: {
            productName,
            expiryDate: extraction.expiryDate,
            rawText: extraction.rawDateText ?? "",
          },
        });
        return;
      }

      let imageUrl: string | null = null;
      let uploadFailed = false;

      try {
        imageUrl = await ctx.imageStorage.upload({
          chatId: message.chatId,
          itemId: randomUUID(),
          buffer: imageBuffer,
          mimeType: imageMimeType,
        });
      } catch (error) {
        uploadFailed = true;
        console.error("Failed to upload photo before save", error);
      }

      await ctx.repository.addItem({
        chatId: message.chatId,
        productName,
        expiryDate: extraction.expiryDate,
        imageUrl,
        confidence: extraction.confidence,
      });

      await ctx.sendLocalized(message.chatId, "itemAdded", {
        params: { productName, expiryDate: extraction.expiryDate },
      });

      if (uploadFailed) {
        await ctx.sendLocalized(message.chatId, "photoUploadFailed");
      }
    },
  };
}

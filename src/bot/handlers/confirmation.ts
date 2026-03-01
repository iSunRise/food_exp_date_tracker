import { randomUUID } from "node:crypto";

import type { BotHandler } from "../handler.js";
import type { IncomingMessage } from "../../shared/types.js";
import { CONFIRMATION_TTL_MS, YES_TOKENS, NO_TOKENS } from "../utils.js";

export interface PendingConfirmation {
  productName: string;
  expiryDate: string;
  confidence: number;
  rawDateText: string | null;
  imageBuffer: Buffer | null;
  imageMimeType: string | null;
  timeoutId: NodeJS.Timeout;
}

export class ConfirmationStore {
  private readonly pending = new Map<string, PendingConfirmation>();

  has(chatId: string): boolean {
    return this.pending.has(chatId);
  }

  get(chatId: string): PendingConfirmation | undefined {
    return this.pending.get(chatId);
  }

  set(chatId: string, payload: Omit<PendingConfirmation, "timeoutId">): void {
    this.clear(chatId);

    const timeoutId = setTimeout(() => {
      this.pending.delete(chatId);
    }, CONFIRMATION_TTL_MS);

    this.pending.set(chatId, { ...payload, timeoutId });
  }

  clear(chatId: string): void {
    const existing = this.pending.get(chatId);
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.pending.delete(chatId);
    }
  }
}

export function createConfirmationHandler(store: ConfirmationStore): BotHandler {
  return {
    name: "confirmation",

    match(message: IncomingMessage): boolean {
      return message.type === "text" && store.has(message.chatId);
    },

    async handle(message: IncomingMessage, ctx): Promise<void> {
      const confirmation = store.get(message.chatId);
      if (!confirmation) {
        await ctx.sendLocalized(message.chatId, "unknownCommand");
        return;
      }

      const normalized = (message.text ?? "").trim().toLowerCase();

      if (YES_TOKENS.has(normalized)) {
        store.clear(message.chatId);

        let imageUrl: string | null = null;
        let uploadFailed = false;

        if (confirmation.imageBuffer && confirmation.imageMimeType) {
          try {
            imageUrl = await ctx.imageStorage.upload({
              chatId: message.chatId,
              itemId: randomUUID(),
              buffer: confirmation.imageBuffer,
              mimeType: confirmation.imageMimeType,
            });
          } catch (error) {
            uploadFailed = true;
            console.error("Failed to upload pending confirmation photo", error);
          }
        }

        await ctx.repository.addItem({
          chatId: message.chatId,
          productName: confirmation.productName,
          expiryDate: confirmation.expiryDate,
          imageUrl,
          confidence: confirmation.confidence,
        });
        await ctx.sendLocalized(message.chatId, "itemAdded", {
          params: {
            productName: confirmation.productName,
            expiryDate: confirmation.expiryDate,
          },
        });

        if (uploadFailed) {
          await ctx.sendLocalized(message.chatId, "photoUploadFailed");
        }

        return;
      }

      if (NO_TOKENS.has(normalized)) {
        store.clear(message.chatId);
        await ctx.sendLocalized(message.chatId, "extractionFailed");
        return;
      }

      await ctx.sendLocalized(message.chatId, "confirmExtraction", {
        params: {
          productName: confirmation.productName,
          expiryDate: confirmation.expiryDate,
          rawText: confirmation.rawDateText ?? "",
        },
      });
    },
  };
}

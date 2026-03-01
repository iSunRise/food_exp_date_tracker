import { extname } from "node:path";

import { Bot, InlineKeyboard } from "grammy";

import type { BotAdapter, CallbackQueryHandler, MessageHandler } from "../shared/interfaces.js";
import type { AlertPayload, IncomingMessage, InlineButton, OutgoingMessage } from "../shared/types.js";

type SupportedUpdateType = "message:text" | "message:photo" | "callback_query:data";

interface TelegramFile {
  file_path?: string;
}

interface TelegramMe {
  id: number;
  username?: string;
}

interface TelegramApiLike {
  getFile(fileId: string): Promise<TelegramFile>;
  getMe(): Promise<TelegramMe>;
  sendMessage(
    chatId: string,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  sendPhoto(
    chatId: string,
    photo: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

interface TelegramContextLike {
  chat?: {
    id: number | string;
  };
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string }>;
  };
  callbackQuery?: {
    id: string;
    data?: string;
    message?: {
      chat: {
        id: number | string;
      };
    };
  };
  api: TelegramApiLike;
  answerCallbackQuery(): Promise<void>;
}

interface TelegramBotLike {
  on(
    updateType: SupportedUpdateType,
    handler: (ctx: TelegramContextLike) => Promise<void>,
  ): void;
  catch(handler: (error: unknown) => void): void;
  start(): Promise<void>;
  stop(): void;
  api: TelegramApiLike;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

type FetchLike = (url: string) => Promise<FetchResponseLike>;

interface LoggerLike {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface TelegramAdapterOptions {
  token: string;
  bot?: TelegramBotLike;
  fetchImpl?: FetchLike;
  logger?: LoggerLike;
}

export class TelegramAdapter implements BotAdapter {
  private readonly token: string;
  private readonly bot: TelegramBotLike;
  private readonly fetchImpl: FetchLike;
  private readonly logger: LoggerLike;

  constructor(options: TelegramAdapterOptions) {
    this.token = options.token;
    this.bot = options.bot ?? ((new Bot(options.token) as unknown) as TelegramBotLike);
    this.fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));
    this.logger = options.logger ?? console;

    this.bot.catch((error) => {
      this.logger.error("Telegram adapter error", error);
    });
  }

  onMessage(handler: MessageHandler): void {
    this.bot.on("message:text", async (ctx) => {
      const textMessage = ctx.message;
      const chatId = ctx.chat?.id;

      if (!textMessage || chatId === undefined) {
        return;
      }

      const incoming: IncomingMessage = {
        id: textMessage.message_id.toString(),
        chatId: chatId.toString(),
        type: "text",
        text: textMessage.text ?? null,
        imageBuffer: null,
        imageMimeType: null,
        callbackData: null,
      };

      await handler(incoming);
    });

    this.bot.on("message:photo", async (ctx) => {
      const photoMessage = ctx.message;
      const chatId = ctx.chat?.id;

      if (!photoMessage || chatId === undefined) {
        return;
      }

      const photo = await this.downloadLargestPhoto(ctx);
      const incoming: IncomingMessage = {
        id: photoMessage.message_id.toString(),
        chatId: chatId.toString(),
        type: "photo",
        text: photoMessage.caption ?? null,
        imageBuffer: photo.imageBuffer,
        imageMimeType: photo.imageMimeType,
        callbackData: null,
      };

      await handler(incoming);
    });
  }

  onCallbackQuery(handler: CallbackQueryHandler): void {
    this.bot.on("callback_query:data", async (ctx) => {
      try {
        const callbackData = ctx.callbackQuery?.data ?? null;
        const chatId = ctx.callbackQuery?.message?.chat.id;

        if (chatId === undefined || chatId === null) {
          return;
        }

        const incoming: IncomingMessage = {
          id: ctx.callbackQuery?.id ?? "callback",
          chatId: chatId.toString(),
          type: "callback",
          text: null,
          imageBuffer: null,
          imageMimeType: null,
          callbackData,
        };

        await handler(incoming);
      } finally {
        try {
          await ctx.answerCallbackQuery();
        } catch (error) {
          this.logger.error("Failed to answer callback query", error);
        }
      }
    });
  }

  async sendMessage(chatId: string, message: OutgoingMessage): Promise<void> {
    const options: Record<string, unknown> = {};

    if (message.parseMode) {
      options.parse_mode = message.parseMode;
    }

    if (message.inlineKeyboard) {
      options.reply_markup = this.buildInlineKeyboard(message.inlineKeyboard);
    }

    if (message.replyToMessageId) {
      const replyMessageId = Number.parseInt(message.replyToMessageId, 10);
      if (Number.isSafeInteger(replyMessageId)) {
        options.reply_parameters = {
          message_id: replyMessageId,
        };
      }
    }

    const hasOptions = Object.keys(options).length > 0;
    await this.bot.api.sendMessage(chatId, message.text, hasOptions ? options : undefined);
  }

  async sendAlert(chatId: string, alert: AlertPayload): Promise<void> {
    const text =
      alert.localizedText ??
      `⚠️ ${alert.productName} expires in ${alert.daysUntilExpiry} day(s)!\nExpiry date: ${alert.expiryDate}`;
    const consumeLabel = alert.localizedConsumeLabel ?? "Mark Consumed";

    await this.sendMessage(chatId, {
      text,
      inlineKeyboard: [
        [
          {
            text: consumeLabel,
            callbackData: `consume:${alert.foodItemId}`,
          },
        ],
      ],
    });
  }

  async sendPhoto(chatId: string, photoUrl: string, caption?: string): Promise<void> {
    const options = caption ? { caption } : undefined;
    await this.bot.api.sendPhoto(chatId, photoUrl, options);
  }

  async start(): Promise<void> {
    const me = await this.bot.api.getMe();
    const identity = me.username ? `@${me.username}` : `id=${me.id}`;
    this.logger.info(`Telegram bot started as ${identity}`);

    void this.bot.start().catch((error) => {
      this.logger.error("Telegram bot polling failed", error);
    });
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }

  private buildInlineKeyboard(rows: InlineButton[][]): InlineKeyboard {
    const keyboardRows = rows.map((row) =>
      row.map((button) => InlineKeyboard.text(button.text, button.callbackData)),
    );

    return new InlineKeyboard(keyboardRows);
  }

  private async downloadLargestPhoto(
    ctx: TelegramContextLike,
  ): Promise<{ imageBuffer: Buffer | null; imageMimeType: string | null }> {
    const photoSizes = ctx.message?.photo;
    if (!photoSizes || photoSizes.length === 0) {
      return {
        imageBuffer: null,
        imageMimeType: null,
      };
    }

    const largestPhoto = photoSizes[photoSizes.length - 1];

    try {
      const file = await ctx.api.getFile(largestPhoto.file_id);
      if (!file.file_path) {
        throw new Error("Telegram file path is missing");
      }

      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
      const response = await this.fetchImpl(fileUrl);

      if (!response.ok) {
        throw new Error(
          `Telegram file download failed with status ${response.status} (${response.statusText})`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        imageBuffer: Buffer.from(arrayBuffer),
        imageMimeType: this.getMimeTypeFromPath(file.file_path),
      };
    } catch (error) {
      this.logger.error("Failed to download Telegram photo", error);
      return {
        imageBuffer: null,
        imageMimeType: null,
      };
    }
  }

  private getMimeTypeFromPath(filePath: string): string {
    const extension = extname(filePath).toLowerCase();

    switch (extension) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".bmp":
        return "image/bmp";
      case ".tif":
      case ".tiff":
        return "image/tiff";
      case ".heic":
        return "image/heic";
      default:
        return "application/octet-stream";
    }
  }
}

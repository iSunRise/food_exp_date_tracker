import * as v from "valibot";

import type {
  BotAdapter,
  FoodRepository,
  I18nService,
  VisionService,
} from "../shared/interfaces.js";
import { IncomingMessageSchema } from "../shared/schemas.js";
import type { IncomingMessage } from "../shared/types.js";
import type { BotHandler, HandlerContext } from "./handler.js";

export interface BotEngineOptions {
  adapter: BotAdapter;
  vision: VisionService;
  repository: FoodRepository;
  i18n: I18nService;
  handlers: BotHandler[];
}

export class BotEngine {
  private readonly adapter: BotAdapter;
  private readonly handlers: BotHandler[];
  private readonly ctx: HandlerContext;

  constructor(options: BotEngineOptions) {
    this.adapter = options.adapter;
    this.handlers = options.handlers;

    this.ctx = {
      adapter: options.adapter,
      vision: options.vision,
      repository: options.repository,
      i18n: options.i18n,
      sendLocalized: async (chatId, key, opts = {}) => {
        const text = options.i18n.t(chatId, key, opts.params);
        await options.adapter.sendMessage(chatId, {
          text,
          inlineKeyboard: opts.inlineKeyboard,
        });
      },
    };
  }

  start(): void {
    this.adapter.onMessage(async (incoming) => {
      await this.route(incoming);
    });

    this.adapter.onCallbackQuery(async (incoming) => {
      await this.route(incoming);
    });
  }

  private async route(raw: IncomingMessage): Promise<void> {
    const parsed = v.safeParse(IncomingMessageSchema, raw);
    if (!parsed.success) {
      return;
    }

    const message = parsed.output;

    try {
      for (const handler of this.handlers) {
        if (handler.match(message)) {
          await handler.handle(message, this.ctx);
          return;
        }
      }

      await this.ctx.sendLocalized(message.chatId, "unknownCommand");
    } catch {
      await this.ctx.sendLocalized(message.chatId, "unknownCommand");
    }
  }
}

export { LOW_CONFIDENCE_THRESHOLD, CONFIRMATION_TTL_MS, DEFAULT_LOCALE } from "./utils.js";

import type {
  BotAdapter,
  FoodRepository,
  ImageStorageService,
  I18nService,
  VisionService,
} from "../shared/interfaces.js";
import type { IncomingMessage, InlineButton } from "../shared/types.js";

/**
 * Context object passed to every handler. Provides access to all
 * dependencies and shared utilities.
 */
export interface HandlerContext {
  readonly adapter: BotAdapter;
  readonly vision: VisionService;
  readonly repository: FoodRepository;
  readonly i18n: I18nService;
  readonly imageStorage: ImageStorageService;

  /** Translate + send in one call. */
  sendLocalized(
    chatId: string,
    key: string,
    options?: {
      params?: Record<string, unknown>;
      inlineKeyboard?: InlineButton[][];
    },
  ): Promise<void>;
}

/**
 * A pluggable bot handler. Each handler declares what messages it matches
 * and how to process them. The engine tries handlers in registration order;
 * the first match wins.
 */
export interface BotHandler {
  /** Human-readable name for logging/debugging. */
  readonly name: string;

  /** Returns true if this handler should process the message. */
  match(message: IncomingMessage): boolean;

  /** Process the matched message. */
  handle(message: IncomingMessage, ctx: HandlerContext): Promise<void>;
}

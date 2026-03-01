import type { BotHandler } from "../handler.js";
import { consumeHandler } from "./consume.js";
import { ConfirmationStore, createConfirmationHandler } from "./confirmation.js";
import { deleteHandler } from "./delete.js";
import { fallbackHandler } from "./fallback.js";
import { helpHandler } from "./help.js";
import { langCommandHandler, langSelectionHandler } from "./lang.js";
import { listHandler } from "./list.js";
import { photoViewHandler } from "./photo-view.js";
import { createPhotoHandler } from "./photo.js";
import { startHandler } from "./start.js";

/**
 * Creates the default set of bot handlers in the correct order.
 * Order matters — the first matching handler wins.
 */
export function createDefaultHandlers(): BotHandler[] {
  const confirmationStore = new ConfirmationStore();

  return [
    // Callback handlers (most specific first)
    consumeHandler,
    deleteHandler,
    langSelectionHandler,
    photoViewHandler,
    // Text interceptor for pending confirmations (before command matching)
    createConfirmationHandler(confirmationStore),
    // Photo messages
    createPhotoHandler(confirmationStore),
    // Text commands
    startHandler,
    helpHandler,
    listHandler,
    langCommandHandler,
    // Catch-all (must be last)
    fallbackHandler,
  ];
}

export { ConfirmationStore } from "./confirmation.js";

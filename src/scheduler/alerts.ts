import cron, { type ScheduledTask } from "node-cron";

import type {
  BotAdapter,
  FoodRepository,
  I18nService,
} from "../shared/interfaces.js";

export const ALERT_THRESHOLDS_DAYS = [3, 2, 1] as const;
export const DEFAULT_ALERT_CRON_SCHEDULE = "0 9 * * *";

export class AlertScheduler {
  private job: ScheduledTask | null = null;

  constructor(
    private readonly repository: FoodRepository,
    private readonly adapter: BotAdapter,
    private readonly i18n: I18nService,
    private readonly cronSchedule: string = DEFAULT_ALERT_CRON_SCHEDULE,
  ) {}

  start(): void {
    if (this.job) {
      return;
    }

    this.job = cron.schedule(this.cronSchedule, () => {
      void this.checkAndAlert();
    });
  }

  stop(): void {
    if (!this.job) {
      return;
    }

    this.job.stop();
    this.job = null;
  }

  async checkAndAlert(): Promise<void> {
    try {
      for (const threshold of ALERT_THRESHOLDS_DAYS) {
        const targetDate = this.getTargetDate(threshold);
        const items = await this.repository.getUnalertedItemsForDay(targetDate, threshold);

        for (const item of items) {
          try {
            await this.i18n.getLocale(item.chatId);

            const alertText = this.i18n.t(item.chatId, "expiryAlert", {
              productName: item.productName,
              expiryDate: item.expiryDate,
              daysUntil: threshold,
            });
            const consumeLabel = this.i18n.t(item.chatId, "btnConsume");

            await this.adapter.sendAlert(item.chatId, {
              foodItemId: item.id,
              productName: item.productName,
              expiryDate: item.expiryDate,
              daysUntilExpiry: threshold,
              localizedText: alertText,
              localizedConsumeLabel: consumeLabel,
            });
          } catch (error) {
            this.logError("Failed to send alert for item", error, {
              itemId: item.id,
              chatId: item.chatId,
              daysBeforeExpiry: threshold,
            });
            continue;
          }

          await this.repository.recordAlertSent(item.id, threshold);
        }
      }
    } catch (error) {
      this.logError("Scheduler tick failed", error);
    }
  }

  private getTargetDate(daysAhead: number): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead),
    );
  }

  private logError(
    message: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (context) {
      console.error(`[AlertScheduler] ${message}`, context, error);
      return;
    }

    console.error(`[AlertScheduler] ${message}`, error);
  }
}

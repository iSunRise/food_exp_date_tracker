import { and, eq, gte, isNull, lte } from "drizzle-orm";

import type { FoodRepository } from "../shared/interfaces.js";
import type { FoodItem, NewFoodItem } from "../shared/types.js";
import type { StorageDatabase } from "./database.js";
import { alertsSent, foodItems, userPreferences } from "./schema.js";

export class DrizzleFoodRepository implements FoodRepository {
  constructor(private readonly db: StorageDatabase) {}

  async addItem(item: NewFoodItem): Promise<FoodItem> {
    const [created] = await this.db
      .insert(foodItems)
      .values({
        chatId: item.chatId,
        productName: item.productName,
        expiryDate: item.expiryDate,
        imageUrl: item.imageUrl ?? null,
        confidence: item.confidence ?? null,
      })
      .returning();

    return this.mapFoodItem(created);
  }

  async getActiveItems(chatId: string): Promise<FoodItem[]> {
    const items = await this.db
      .select()
      .from(foodItems)
      .where(and(eq(foodItems.chatId, chatId), eq(foodItems.status, "active")))
      .orderBy(foodItems.expiryDate);

    return items.map((item) => this.mapFoodItem(item));
  }

  async getItemById(id: string): Promise<FoodItem | null> {
    const [item] = await this.db
      .select()
      .from(foodItems)
      .where(eq(foodItems.id, id))
      .limit(1);

    return item ? this.mapFoodItem(item) : null;
  }

  async markConsumed(id: string): Promise<void> {
    await this.db
      .update(foodItems)
      .set({
        status: "consumed",
        updatedAt: new Date(),
      })
      .where(eq(foodItems.id, id));
  }

  async deleteItem(id: string): Promise<void> {
    await this.db
      .update(foodItems)
      .set({
        status: "deleted",
        updatedAt: new Date(),
      })
      .where(eq(foodItems.id, id));
  }

  async getItemsExpiringBetween(from: Date, to: Date): Promise<FoodItem[]> {
    const fromDate = this.toDateString(from);
    const toDate = this.toDateString(to);

    const items = await this.db
      .select()
      .from(foodItems)
      .where(
        and(
          eq(foodItems.status, "active"),
          gte(foodItems.expiryDate, fromDate),
          lte(foodItems.expiryDate, toDate),
        ),
      )
      .orderBy(foodItems.expiryDate);

    return items.map((item) => this.mapFoodItem(item));
  }

  async recordAlertSent(itemId: string, daysBeforeExpiry: number): Promise<void> {
    await this.db
      .insert(alertsSent)
      .values({
        foodItemId: itemId,
        daysBeforeExpiry,
      })
      .onConflictDoNothing({
        target: [alertsSent.foodItemId, alertsSent.daysBeforeExpiry],
      });
  }

  async getUnalertedItemsForDay(
    targetDate: Date,
    daysBeforeExpiry: number,
  ): Promise<FoodItem[]> {
    const targetDateString = this.toDateString(targetDate);

    const rows = await this.db
      .select({
        item: foodItems,
      })
      .from(foodItems)
      .leftJoin(
        alertsSent,
        and(
          eq(alertsSent.foodItemId, foodItems.id),
          eq(alertsSent.daysBeforeExpiry, daysBeforeExpiry),
        ),
      )
      .where(
        and(
          eq(foodItems.status, "active"),
          eq(foodItems.expiryDate, targetDateString),
          isNull(alertsSent.id),
        ),
      )
      .orderBy(foodItems.expiryDate);

    return rows.map((row) => this.mapFoodItem(row.item));
  }

  async getLocale(chatId: string): Promise<string> {
    const [preference] = await this.db
      .select({
        locale: userPreferences.locale,
      })
      .from(userPreferences)
      .where(eq(userPreferences.chatId, chatId))
      .limit(1);

    return preference?.locale ?? "en";
  }

  async setLocale(chatId: string, locale: string): Promise<void> {
    await this.db
      .insert(userPreferences)
      .values({
        chatId,
        locale,
      })
      .onConflictDoUpdate({
        target: userPreferences.chatId,
        set: {
          locale,
        },
      });
  }

  private toDateString(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private mapFoodItem(item: typeof foodItems.$inferSelect): FoodItem {
    return {
      id: item.id,
      chatId: item.chatId,
      productName: item.productName,
      expiryDate: item.expiryDate,
      imageUrl: item.imageUrl,
      status: item.status as FoodItem["status"],
      confidence: item.confidence,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

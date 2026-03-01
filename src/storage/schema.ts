import {
  date,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const foodItems = pgTable(
  "food_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: varchar("chat_id", { length: 64 }).notNull(),
    productName: varchar("product_name", { length: 255 }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    imageUrl: text("image_url"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("food_items_chat_id_idx").on(table.chatId),
    index("food_items_expiry_date_active_idx")
      .on(table.expiryDate)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const alertsSent = pgTable(
  "alerts_sent",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    foodItemId: uuid("food_item_id")
      .notNull()
      .references(() => foodItems.id, { onDelete: "cascade" }),
    daysBeforeExpiry: integer("days_before_expiry").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("alerts_sent_food_item_id_days_before_expiry_uidx").on(
      table.foodItemId,
      table.daysBeforeExpiry,
    ),
    index("alerts_sent_food_item_id_idx").on(table.foodItemId),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  chatId: varchar("chat_id", { length: 64 }).primaryKey(),
  locale: varchar("locale", { length: 5 }).notNull().default("en"),
});


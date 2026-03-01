import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

import { createDatabaseConnection } from "../../src/storage/database.js";
import { DrizzleFoodRepository } from "../../src/storage/repository.js";
import { alertsSent } from "../../src/storage/schema.js";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/food_tracker";

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString);
  return decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
}

function getAdminConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

function toSqlIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function isServerReachable(connectionString: string): Promise<boolean> {
  const client = new Client({
    connectionString: getAdminConnectionString(connectionString),
    connectionTimeoutMillis: 1500,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const adminClient = new Client({
    connectionString: getAdminConnectionString(connectionString),
    connectionTimeoutMillis: 1500,
  });

  const dbName = getDatabaseName(connectionString);

  await adminClient.connect();

  try {
    const result = await adminClient.query(
      "select 1 from pg_database where datname = $1",
      [dbName],
    );

    if ((result.rowCount ?? 0) === 0) {
      await adminClient.query(`create database ${toSqlIdentifier(dbName)}`);
    }
  } finally {
    await adminClient.end().catch(() => undefined);
  }
}

const DATABASE_AVAILABLE = await isServerReachable(TEST_DATABASE_URL);
const describeIfDb = DATABASE_AVAILABLE ? describe : describe.skip;

describeIfDb("DrizzleFoodRepository", () => {
  let db: ReturnType<typeof createDatabaseConnection>["db"] | null = null;
  let close: (() => Promise<void>) | null = null;
  let repository: DrizzleFoodRepository | null = null;

  function requireDb() {
    if (!db) {
      throw new Error("Database is not initialized.");
    }

    return db;
  }

  function requireRepository() {
    if (!repository) {
      throw new Error("Repository is not initialized.");
    }

    return repository;
  }

  beforeAll(async () => {
    await ensureDatabaseExists(TEST_DATABASE_URL);

    const connection = createDatabaseConnection(TEST_DATABASE_URL);
    db = connection.db;
    close = connection.close;
    repository = new DrizzleFoodRepository(connection.db);

    await migrate(connection.db, { migrationsFolder: "drizzle" });
  });

  beforeEach(async () => {
    await requireDb().execute(
      sql`TRUNCATE TABLE alerts_sent, food_items, user_preferences CASCADE`,
    );
  });

  afterAll(async () => {
    if (close) {
      await close();
    }
  });

  it("adds and fetches an item by id", async () => {
    const created = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Milk",
      expiryDate: "2026-03-10",
      imageUrl: "telegram:file_1",
      confidence: 0.9,
    });

    expect(created.id).toBeTypeOf("string");
    expect(created.status).toBe("active");
    expect(created.chatId).toBe("chat-1");
    expect(created.productName).toBe("Milk");
    expect(created.expiryDate).toBe("2026-03-10");
    expect(created.imageUrl).toBe("telegram:file_1");
    expect(created.confidence).toBe(0.9);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);

    const fetched = await requireRepository().getItemById(created.id);
    expect(fetched).toEqual(created);
  });

  it("returns active items sorted by nearest expiry date", async () => {
    await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Cheese",
      expiryDate: "2026-03-12",
    });
    const first = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Yogurt",
      expiryDate: "2026-03-05",
    });
    await requireRepository().addItem({
      chatId: "chat-2",
      productName: "Other chat item",
      expiryDate: "2026-03-01",
    });

    const activeItems = await requireRepository().getActiveItems("chat-1");

    expect(activeItems.map((item) => item.productName)).toEqual(["Yogurt", "Cheese"]);
    expect(activeItems[0]?.id).toBe(first.id);
  });

  it("marks items as consumed and excludes them from active list", async () => {
    const item = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Butter",
      expiryDate: "2026-03-15",
    });

    await requireRepository().markConsumed(item.id);

    const updated = await requireRepository().getItemById(item.id);
    expect(updated?.status).toBe("consumed");
    await expect(requireRepository().getActiveItems("chat-1")).resolves.toEqual([]);
  });

  it("soft deletes items and excludes them from active list", async () => {
    const item = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Sour cream",
      expiryDate: "2026-03-20",
    });

    await requireRepository().deleteItem(item.id);

    const updated = await requireRepository().getItemById(item.id);
    expect(updated?.status).toBe("deleted");
    await expect(requireRepository().getActiveItems("chat-1")).resolves.toEqual([]);
  });

  it("returns active items expiring in a date range", async () => {
    await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Outside lower bound",
      expiryDate: "2026-02-27",
    });
    const inRangeA = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "In range A",
      expiryDate: "2026-03-01",
    });
    const inRangeB = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "In range B",
      expiryDate: "2026-03-03",
    });
    const consumed = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Consumed in range",
      expiryDate: "2026-03-02",
    });
    await requireRepository().markConsumed(consumed.id);

    const result = await requireRepository().getItemsExpiringBetween(
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-03T23:59:59.999Z"),
    );

    expect(result.map((item) => item.id)).toEqual([inRangeA.id, inRangeB.id]);
  });

  it("returns only unalerted items for a threshold day", async () => {
    const itemA = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Milk",
      expiryDate: "2026-03-04",
    });
    const itemB = await requireRepository().addItem({
      chatId: "chat-2",
      productName: "Juice",
      expiryDate: "2026-03-04",
    });
    await requireRepository().addItem({
      chatId: "chat-3",
      productName: "Wrong day",
      expiryDate: "2026-03-05",
    });

    await requireRepository().recordAlertSent(itemA.id, 2);
    await requireRepository().recordAlertSent(itemB.id, 1);

    const unalertedFor2Days = await requireRepository().getUnalertedItemsForDay(
      new Date("2026-03-04T00:00:00.000Z"),
      2,
    );

    expect(unalertedFor2Days.map((item) => item.id)).toEqual([itemB.id]);
  });

  it("records alerts idempotently", async () => {
    const item = await requireRepository().addItem({
      chatId: "chat-1",
      productName: "Eggs",
      expiryDate: "2026-03-07",
    });

    await requireRepository().recordAlertSent(item.id, 3);
    await requireRepository().recordAlertSent(item.id, 3);

    const rows = await requireDb().select().from(alertsSent);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.foodItemId).toBe(item.id);
    expect(rows[0]?.daysBeforeExpiry).toBe(3);
  });

  it("defaults locale to en and upserts locale values", async () => {
    await expect(requireRepository().getLocale("chat-1")).resolves.toBe("en");

    await requireRepository().setLocale("chat-1", "uk");
    await expect(requireRepository().getLocale("chat-1")).resolves.toBe("uk");

    await requireRepository().setLocale("chat-1", "en");
    await expect(requireRepository().getLocale("chat-1")).resolves.toBe("en");
  });
});

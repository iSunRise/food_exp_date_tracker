import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type StorageDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: StorageDatabase;
  close: () => Promise<void>;
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}


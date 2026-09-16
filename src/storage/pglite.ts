import { PGlite } from "@electric-sql/pglite";
import { SqlStorage, type SqlExecutor } from "./sql.js";

export function pgliteExecutor(db: PGlite): SqlExecutor {
  return {
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      const result = await db.query<T>(sql, params as unknown[] | undefined);
      return result.rows;
    },
    exec: async (sql: string): Promise<void> => {
      await db.exec(sql);
    },
  };
}

export interface PgliteStorageHandle {
  storage: SqlStorage;
  db: PGlite;
  close: () => Promise<void>;
}

export async function createPgliteStorage(
  dataDir?: string,
): Promise<PgliteStorageHandle> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;

  const storage = new SqlStorage(pgliteExecutor(db));
  await storage.init();

  return { storage, db, close: () => db.close() };
}

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface SqliteConnection {
  db: DatabaseSync;
  dbPath: string;
  withTransaction: <T>(fn: () => T) => T;
  close: () => void;
}

let singletonConnection: SqliteConnection | null = null;

export function createSqliteConnection(customDbPath?: string): SqliteConnection {
  const resolvedPath =
    customDbPath ||
    process.env.SQLITE_DB_PATH ||
    path.resolve(process.cwd(), 'data', 'xaiwork_pos.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(resolvedPath);

  // Tune SQLite for high-concurrency multi-tenant POS workloads
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA temp_store = MEMORY;');

  let txDepth = 0;

  function withTransaction<T>(fn: () => T): T {
    if (txDepth === 0) {
      db.exec('BEGIN IMMEDIATE;');
      txDepth = 1;
      try {
        const result = fn();
        db.exec('COMMIT;');
        txDepth = 0;
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // ignore rollback error if already rolled back
        }
        txDepth = 0;
        throw err;
      }
    } else {
      const spName = `sp_${txDepth}`;
      txDepth += 1;
      db.exec(`SAVEPOINT ${spName};`);
      try {
        const result = fn();
        db.exec(`RELEASE SAVEPOINT ${spName};`);
        txDepth -= 1;
        return result;
      } catch (err) {
        try {
          db.exec(`ROLLBACK TO SAVEPOINT ${spName};`);
          db.exec(`RELEASE SAVEPOINT ${spName};`);
        } catch {
          // ignore nested savepoint cleanup error
        }
        txDepth -= 1;
        throw err;
      }
    }
  }

  return {
    db,
    dbPath: resolvedPath,
    withTransaction,
    close: () => {
      db.close();
      if (singletonConnection?.db === db) {
        singletonConnection = null;
      }
    },
  };
}

export function getDefaultSqliteConnection(): SqliteConnection {
  if (!singletonConnection) {
    singletonConnection = createSqliteConnection();
  }
  return singletonConnection;
}

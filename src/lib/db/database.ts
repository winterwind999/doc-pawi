import type { Db, DbExecutor, RawConnection, SqlValue } from './types';

/** FIFO async mutex: each task starts after the previous one settles. */
export class AsyncLock {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export interface CreateDbOptions {
  /** Called after every successful write outside a transaction and after every commit. */
  onWrite?: () => void;
}

/**
 * Wraps a raw connection so that:
 * - every write (`run`/`exec`) outside a transaction is serialized with transactions;
 * - `transaction()` uses `BEGIN IMMEDIATE` and always commits or rolls back.
 * Reads are not locked; they may observe the in-progress state of a transaction on the same connection.
 */
export function createDb(raw: RawConnection, options: CreateDbOptions = {}): Db {
  const lock = new AsyncLock();
  let closed = false;
  const notify = () => {
    try {
      options.onWrite?.();
    } catch {
      // Listeners must never break a committed write.
    }
  };

  const assertOpen = () => {
    if (closed) throw new Error('The health database is locked. Unlock Doc Pawi to continue.');
  };

  return {
    async exec(sql: string) {
      assertOpen();
      await lock.run(() => raw.exec(sql));
      notify();
    },
    async run(sql: string, params?: readonly SqlValue[]) {
      assertOpen();
      const result = await lock.run(() => raw.run(sql, params));
      if (result.changes > 0) notify();
      return result;
    },
    all<T>(sql: string, params?: readonly SqlValue[]) {
      assertOpen();
      return raw.all<T>(sql, params);
    },
    get<T>(sql: string, params?: readonly SqlValue[]) {
      assertOpen();
      return raw.get<T>(sql, params);
    },
    async transaction<T>(fn: (tx: DbExecutor) => Promise<T>) {
      assertOpen();
      const value = await lock.run(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // The original error is more useful than a rollback failure.
          }
          throw error;
        }
      });
      notify();
      return value;
    },
    async close() {
      if (closed) return;
      await lock.run(async () => {
        closed = true;
        await raw.close();
      });
    },
  };
}

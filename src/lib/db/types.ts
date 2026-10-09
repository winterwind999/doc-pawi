/**
 * Minimal database contract used by repositories.
 *
 * The app implements it with expo-sqlite (SQLCipher build) and the unit tests implement it
 * with Node's built-in `node:sqlite`, so the same SQL and repository code runs in both.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DbExecutor {
  /** Executes one or more statements without parameters (DDL, pragmas). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
}

export interface Db extends DbExecutor {
  /**
   * Runs `fn` inside `BEGIN IMMEDIATE … COMMIT`, rolling back on error.
   * Writes are serialized with a lock so two transactions never interleave on the shared connection.
   */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Driver-level connection that `createDb` wraps with locking and transactions. */
export interface RawConnection extends DbExecutor {
  close(): Promise<void>;
}

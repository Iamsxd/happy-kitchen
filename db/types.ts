export type QueryMeta = { changes: number; last_row_id?: number | string | null };

export type QueryResult<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: QueryMeta;
};

export interface AppPreparedStatement {
  bind(...values: unknown[]): AppPreparedStatement;
  run(): Promise<QueryResult>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface AppDatabase {
  prepare(sql: string): AppPreparedStatement;
  batch(statements: AppPreparedStatement[]): Promise<QueryResult[]>;
}

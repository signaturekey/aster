import type { SqlDatabase } from "@api/db/kysely";
import type { DB } from "@api/db/types";
import {
  Kysely,
  PostgresDialect,
  type AbortableOperationOptions,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";

type QueryObserver = {
  before?: (query: CompiledQuery) => void | Promise<void>;
  after?: (query: CompiledQuery) => void | Promise<void>;
};

// Borrow the shared test pool, wrapping only this client's connections. Queries,
// including BEGIN/COMMIT and queries inside transactions, still reach PostgreSQL.
// The shared helpers own cleanup; this view has no pool/lifecycle of its own.
export function observeQueries(db: SqlDatabase, observer: QueryObserver) {
  const executor = db.getExecutor();
  const dialect = new PostgresDialect({
    pool: () => {
      throw new Error("Query observers must borrow the shared test connection");
    },
  });
  function observeConnection(
    connection: DatabaseConnection,
  ): DatabaseConnection {
    return {
      async executeQuery<R>(
        query: CompiledQuery,
        options?: AbortableOperationOptions,
      ) {
        await observer.before?.(query);
        const result = await connection.executeQuery<R>(query, options);
        await observer.after?.(query);
        return result;
      },
      streamQuery: connection.streamQuery.bind(connection),
      ...(connection.cancelQuery
        ? { cancelQuery: connection.cancelQuery.bind(connection) }
        : {}),
      ...(connection.collectSessionInfo
        ? { collectSessionInfo: connection.collectSessionInfo.bind(connection) }
        : {}),
      ...(connection.killSession
        ? { killSession: connection.killSession.bind(connection) }
        : {}),
    };
  }
  return new Kysely<DB>({
    config: { dialect },
    dialect,
    // PostgreSQL transaction commands use the wrapped connection directly. This
    // driver's pool is never initialized/acquired: the executor borrows from db.
    driver: dialect.createDriver(),
    executor: executor.withConnectionProvider({
      provideConnection: (consumer, options) =>
        executor.provideConnection(
          (connection) => consumer(observeConnection(connection)),
          options,
        ),
    }),
  });
}

export function isRecipientSelection(query: CompiledQuery) {
  return (
    query.sql.startsWith(
      'select "user_id" as "userId" from "conversation_members"',
    ) && query.sql.includes('"user_id" in (')
  );
}

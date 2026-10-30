import type { DB } from "@api/db/types";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { Pool } from "pg";

export function createSqlDatabase(connectionString: string) {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
  });
}

// The application owns this single pool. Kysely.destroy() closes it; callers
// (including Better Auth) borrow the connection and must not close it separately.
export type SqlDatabase = Kysely<DB>;
export type SqlTransaction = Transaction<DB>;
export type SqlConnection = SqlDatabase | SqlTransaction;

import type { DB } from "@api/db/types";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { Pool } from "pg";

export function createSqlDatabase(connectionString: string) {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
  });
}

// During the staged port the Prisma connection remains separate; this is the
// only new connection owner. Kysely.destroy() also closes its pg pool.
export type SqlDatabase = Kysely<DB>;
export type SqlTransaction = Transaction<DB>;
export type SqlConnection = SqlDatabase | SqlTransaction;

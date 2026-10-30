import type { SqlTransaction } from "@api/db/kysely";

// Project mutations and conversation authorization share this lock. Always read
// current ownership, recruitment and membership only after acquiring it.
export async function lockProjectRow(
  tx: SqlTransaction,
  id: string,
): Promise<boolean> {
  const row = await tx
    .selectFrom("projects")
    .select("id")
    .where("id", "=", id)
    .forUpdate()
    .executeTakeFirst();
  return row !== undefined;
}

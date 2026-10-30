import type { Prisma } from "@api/generated/prisma/client";

// Shared by project mutations and conversation access. Read membership and other
// mutable project state only after acquiring this transaction-scoped lock.
export async function lockProjectRow(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE
  `;
  return rows.length > 0;
}

import { ProductError } from "@api/lib/errors";
import { t } from "elysia";

export const pageQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 50, default: 20 })),
  cursor: t.Optional(t.String({ maxLength: 512 })),
});

export function encodeCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(
    JSON.stringify([row.createdAt.toISOString(), row.id]),
  ).toString("base64url");
}

// PostgreSQL timestamps start at Julian day zero (4714-11-24 BC, or -4713
// in ISO astronomical years). JS accepts older dates that pg cannot bind.
// Its maximum valid Date is below PostgreSQL's upper timestamp bound.
const MIN_POSTGRES_TIMESTAMP = Date.parse("-004713-11-24T00:00:00.000Z");

export function decodeCursor(value: string | undefined) {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error();
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    );
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error();
    const [time, id] = decoded;
    if (
      typeof time !== "string" ||
      typeof id !== "string" ||
      !id.length ||
      id.length > 128 ||
      id.includes("\u0000") ||
      !id.isWellFormed()
    )
      throw new Error();
    const createdAt = new Date(time);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.getTime() < MIN_POSTGRES_TIMESTAMP ||
      createdAt.toISOString() !== time
    )
      throw new Error();
    if (encodeCursor({ id, createdAt }) !== value) throw new Error();
    return { createdAt, id };
  } catch {
    throw new ProductError(422, "INVALID_CURSOR", "Cursor is invalid");
  }
}

export type PageQuery = (typeof pageQuerySchema)["static"];

export function pageOptions(query: PageQuery) {
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new ProductError(422, "INVALID_LIMIT", "Limit must be from 1 to 50.");
  return { limit, cursor: decodeCursor(query.cursor) };
}

export function beforeCursor(cursor: ReturnType<typeof decodeCursor>) {
  return cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
}

export function pageResult<T>(
  rows: T[],
  limit: number,
  cursorRow: (row: T) => { id: string; createdAt: Date },
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last ? encodeCursor(cursorRow(last)) : null,
  };
}

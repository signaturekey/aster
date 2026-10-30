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
      id.length > 128
    )
      throw new Error();
    const createdAt = new Date(time);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== time
    )
      throw new Error();
    if (encodeCursor({ id, createdAt }) !== value) throw new Error();
    return { createdAt, id };
  } catch {
    throw new ProductError(422, "INVALID_CURSOR", "Cursor is invalid");
  }
}

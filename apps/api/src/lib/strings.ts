import { t } from "elysia";
import { FormatRegistry } from "elysia/type-system";

export function isPostgresText(value: string) {
  // PostgreSQL text rejects NUL; UTF-8 encoding replaces lone UTF-16 surrogates.
  // Reject both at the boundary instead of losing fidelity or breaking retries.
  return !value.includes("\u0000") && value.isWellFormed();
}

FormatRegistry.Set("aster-postgres-text", isPostgresText);

export function postgresText(options: Parameters<typeof t.String>[0] = {}) {
  return t.String({ format: "aster-postgres-text", ...options });
}

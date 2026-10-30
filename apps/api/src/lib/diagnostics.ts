type ErrorContext = {
  operation:
    "http.request" | "sse.delivery" | "sse.heartbeat" | "sse.recipients";
  method?: string;
  path?: string;
};

export function logUnexpectedError(error: unknown, context: ErrorContext) {
  // Exception messages and Prisma metadata can contain SQL, credentials or text.
  // Keep the operation and error classification, never request headers/body/query.
  const kind =
    error instanceof TypeError
      ? "TypeError"
      : error instanceof Error
        ? "Error"
        : "Unknown";
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^(P\d{4}|[0-9A-Z]{5})$/.test(error.code)
      ? error.code
      : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      ...context,
      kind,
      ...(code ? { code } : {}),
    }),
  );
}

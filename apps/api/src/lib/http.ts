import { logUnexpectedError } from "@api/lib/diagnostics";
import { errorBody, ProductError } from "@api/lib/errors";
import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

export function httpBoundary(trustedOrigins: string[]) {
  return new Elysia({ name: "http-boundary", normalize: false })
    .use(
      cors({
        origin: trustedOrigins,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type"],
      }),
    )
    .onError({ as: "global" }, ({ error, code, status, request }) => {
      if (error instanceof ProductError)
        return status(error.status, errorBody(error.code, error.message));
      if (code === "VALIDATION" || code === "PARSE")
        return status(422, errorBody("VALIDATION_ERROR", "Request is invalid"));
      if (code === "NOT_FOUND")
        return status(404, errorBody("NOT_FOUND", "Resource not found"));
      logUnexpectedError(error, {
        operation: "http.request",
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return status(
        500,
        errorBody("INTERNAL_ERROR", "An internal error occurred"),
      );
    });
}

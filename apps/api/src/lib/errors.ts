import { t } from "elysia";

export class ProductError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorSchema = t.Object({
  error: t.Object({ code: t.String(), message: t.String() }),
});
export const errorResponses = {
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  422: errorSchema,
  500: errorSchema,
};
export const errorBody = (code: string, message: string) => ({
  error: { code, message },
});

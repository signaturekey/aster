export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function responseError(status: number, value: unknown): ApiError {
  const body = record(value);
  const product = record(body?.error);
  // Better Auth and product errors have different envelopes; neither message is
  // rendered raw because provider/internal wording is not public Russian copy.
  const candidate = product?.code ?? body?.code;
  return new ApiError(
    status,
    typeof candidate === "string" ? candidate : "UNKNOWN",
  );
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.";
  // Native sign-in uses 401 for wrong credentials, not an expired session.
  if (error.code === "INVALID_EMAIL_OR_PASSWORD")
    return "Неверная почта или пароль.";
  if (error.status === 401) return "Войдите снова, чтобы продолжить.";
  const messages: Record<string, string> = {
    USER_ALREADY_EXISTS: "Аккаунт с такой почтой уже существует.",
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      "Аккаунт с такой почтой уже существует.",
    PROFILE_INCOMPLETE: "Заполните обязательные поля профиля.",
    DISCOVERY_DISABLED: "Включите участие в поиске в настройках профиля.",
    REQUEST_ID_CONFLICT:
      "Эта попытка отправки связана с другим текстом. Создайте новое сообщение.",
    RECRUITMENT_CLOSED: "Набор в проект уже закрыт. Обновите страницу проекта.",
    INVALID_CURSOR: "Список изменился. Обновите его и попробуйте снова.",
  };
  const knownMessage = messages[error.code];
  if (knownMessage) return knownMessage;
  if (error.status === 403) return "У вас нет доступа к этому действию.";
  if (error.status === 404)
    return "Не удалось найти запрошенную страницу или запись.";
  if (error.status === 409)
    return "Данные уже изменились. Обновите их и повторите действие.";
  if (error.status === 422 || error.status === 400)
    return "Проверьте введённые данные. Сервер не принял запрос.";
  if (error.status === 429)
    return "Слишком много запросов. Подождите и попробуйте снова.";
  return "Сервер не смог выполнить действие. Попробуйте позже.";
}

export async function unwrap<T>(
  request: PromiseLike<{
    data: T | null;
    error: { status: number; value: unknown } | null;
  }>,
): Promise<T> {
  const result = await request;
  if (result.error)
    throw responseError(result.error.status, result.error.value);
  if (result.data === null) throw new ApiError(500, "EMPTY_RESPONSE");
  return result.data;
}

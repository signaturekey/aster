import type { Application, ProjectCreate } from "@web/entities/project/types";
import { nonblank, textLength, within } from "@web/shared/lib/forms";
import { ApiError } from "@web/shared/api/errors";

export type CatalogueFilters = { q: string; goalId: string };
export function catalogueFilters(params: URLSearchParams): CatalogueFilters {
  return {
    q: (params.get("q") ?? "").trim(),
    goalId: params.get("goalId") ?? "",
  };
}
export function catalogueParams(filters: CatalogueFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.goalId) params.set("goalId", filters.goalId);
  // A filter change deliberately drops any previous cursor; cursors are query-local.
  return params;
}
export const catalogueKey = (
  account: string | undefined,
  filters: CatalogueFilters,
) =>
  [account, "projects", "catalogue", filters.q.trim(), filters.goalId] as const;

export type ProjectValues = Omit<ProjectCreate, "requiredRoles"> & {
  roles: string;
  recruitmentOpen: boolean;
};
export function parseRoles(value: string) {
  return value
    .split("\n")
    .map((role) => role.trim())
    .filter(Boolean);
}
export function validateRoles(value: string): true | string {
  const roles = parseRoles(value);
  if (roles.length < 1 || roles.length > 10) return "Укажите от 1 до 10 ролей.";
  return (
    roles.every((role) => textLength(role) <= 80 && !role.includes("\0")) ||
    "Каждая роль — до 80 символов, без нулевого символа."
  );
}
export function validateText(value: string, max: number): true | string {
  return nonblank(value) === true
    ? value.includes("\0")
      ? "Удалите нулевой символ."
      : within(value, max)
    : "Заполните это поле.";
}
export function validateSkills(ids: string[]): true | string {
  return ids.length <= 20 || "Выберите не больше 20 навыков.";
}
export function projectPayload(values: ProjectValues): ProjectCreate {
  return {
    title: values.title,
    description: values.description,
    goalId: values.goalId,
    requiredRoles: parseRoles(values.roles),
    requiredSkillIds: [...new Set(values.requiredSkillIds)],
  };
}
export const applicationLabels: Record<Application["state"], string> = {
  pending: "На рассмотрении",
  accepted: "Принята",
  rejected: "Отклонена",
  withdrawn: "Отозвана",
};
export function applicationActions(
  state: Application["state"],
  owner: boolean,
  open: boolean,
) {
  return {
    withdraw: state === "pending" && !owner,
    accept: state === "pending" && owner && open,
    reject: state === "pending" && owner,
  };
}
export function projectErrorHint(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const hints: Record<string, string> = {
    APPLICATION_PENDING:
      "У вас уже есть заявка на рассмотрении. Проверьте историю заявок.",
    ALREADY_MEMBER: "Вы уже участник. Обновите состав команды.",
    APPLICATION_DECIDED: "Решение по заявке уже изменилось. Обновите историю.",
    OWNER_CANNOT_LEAVE: "Сначала передайте проект другому участнику команды.",
    MEMBER_REQUIRED: "Новый владелец должен оставаться участником команды.",
    RECRUITMENT_CLOSED:
      "Набор закрыт: подача и принятие заявок недоступны. Отклонение и отзыв по-прежнему разрешены.",
  };
  return hints[error.code];
}
// Membership changes revoke conversation/history authorization too; refreshing
// only the visible roster would leave stale chat and account controls cached.
export const projectMutationRoots = [
  "projects",
  "applications",
  "conversations",
  "messages",
] as const;
export function affectedProjectQuery(
  account: string | undefined,
  key: readonly unknown[],
) {
  return (
    !!account &&
    key[0] === account &&
    projectMutationRoots.some((root) => key[1] === root)
  );
}
export function dedupeRows<T>(
  pages: { items: T[] }[] | undefined,
  key: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  return (pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => {
      const id = key(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

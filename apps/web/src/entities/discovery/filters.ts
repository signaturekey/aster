import type { DiscoveryFilters } from "./queries";

const singleKeys = ["specializationId", "experienceId"] as const;
const multipleKeys = ["skillIds", "goalIds"] as const;

export function normalizeFilters(params: URLSearchParams): DiscoveryFilters {
  const filters: DiscoveryFilters = {};
  for (const key of singleKeys) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value;
  }
  for (const key of multipleKeys) {
    // Order and duplicate URL values do not change ALL-skills / ANY-goals
    // semantics. Unknown IDs remain visible to server validation, not broadened.
    const values = [
      ...new Set(
        params
          .getAll(key)
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].sort();
    if (values.length) filters[key] = values;
  }
  return filters;
}

export function filtersToSearch(
  filters: DiscoveryFilters,
  current = new URLSearchParams(),
) {
  const params = new URLSearchParams(current);
  for (const key of [...singleKeys, ...multipleKeys]) params.delete(key);
  // Cursors belong to a particular filter context, never a shared URL page.
  params.delete("cursor");
  for (const key of singleKeys) if (filters[key]) params.set(key, filters[key]);
  for (const key of multipleKeys)
    for (const id of filters[key] ?? []) params.append(key, id);
  return params;
}

export function discoveryKey(accountId: string, filters: DiscoveryFilters) {
  return [
    accountId,
    "discovery",
    normalizeFilters(filtersToSearch(filters)),
  ] as const;
}

export function filterCount(filters: DiscoveryFilters) {
  return (
    Number(!!filters.specializationId) +
    Number(!!filters.experienceId) +
    (filters.skillIds?.length ?? 0) +
    (filters.goalIds?.length ?? 0)
  );
}

export function filterProblem(filters: DiscoveryFilters): string | null {
  const ids = [
    filters.specializationId,
    filters.experienceId,
    ...(filters.skillIds ?? []),
    ...(filters.goalIds ?? []),
  ].filter((id): id is string => !!id);
  if (
    (filters.skillIds?.length ?? 0) > 20 ||
    (filters.goalIds?.length ?? 0) > 5 ||
    ids.some((id) => Array.from(id).length > 80 || id.includes("\u0000"))
  )
    return "В ссылке слишком много фильтров или некорректный идентификатор. Сбросьте фильтры и выберите их заново.";
  return null;
}

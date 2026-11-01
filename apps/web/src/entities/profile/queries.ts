import { api } from "@web/shared/api/client";
import { unwrap } from "@web/shared/api/errors";

const russianLabels: Record<string, string> = {
  backend: "Бэкенд-разработка",
  frontend: "Фронтенд-разработка",
  fullstack: "Фулстек-разработка",
  mobile: "Мобильная разработка",
  data: "Инженерия данных",
  design: "Дизайн",
  qa: "Тестирование",
  product: "Управление продуктом",
  beginner: "Начинающий",
  junior: "Джуниор",
  middle: "Мидл",
  senior: "Сеньор",
  lead: "Лид",
  startup: "Стартап",
  hackathon: "Хакатон",
  "side-project": "Пет-проект",
  learning: "Обучение",
  "pair-programming": "Парное программирование",
};
export const loadDictionaries = async (signal: AbortSignal) => {
  const data = await unwrap(api.api.v1.dictionaries.get({ fetch: { signal } }));
  const labels = (items: typeof data.skills) =>
    items.map((item) => ({
      ...item,
      label: russianLabels[item.id] ?? item.label,
    }));
  // Local presentation labels keep stable API dictionary identifiers/contracts intact.
  return {
    specializations: labels(data.specializations),
    skills: labels(data.skills),
    experienceLevels: labels(data.experienceLevels),
    goals: labels(data.goals),
  };
};
export const loadProfile = (userId: string | undefined, signal: AbortSignal) =>
  userId
    ? unwrap(api.api.v1.profiles({ userId }).get({ fetch: { signal } }))
    : unwrap(api.api.v1.me.profile.get({ fetch: { signal } }));
export type Profile = Awaited<ReturnType<typeof loadProfile>>;
export type Dictionaries = Awaited<ReturnType<typeof loadDictionaries>>;
export type ProfilePatch = Parameters<typeof api.api.v1.me.profile.patch>[0];

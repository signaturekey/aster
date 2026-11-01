import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import { loadDictionaries, loadProfile } from "@web/entities/profile/queries";
import { ProfileForm } from "@web/features/edit-profile/ProfileForm";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel, Loading } from "@web/shared/ui/feedback";

export function ProfilePage({ edit = false }: { edit?: boolean }) {
  const { personId } = useParams();
  const session = useSession();
  const profile = useQuery({
    queryKey: [session.me?.id, "profile", personId ?? "me"],
    queryFn: () => session.run((signal) => loadProfile(personId, signal)),
  });
  const dictionaries = useQuery({
    queryKey: [session.me?.id, "dictionaries"],
    queryFn: () => session.run(loadDictionaries),
  });
  if (profile.isPending || dictionaries.isPending) return <Loading />;
  if (profile.error || dictionaries.error)
    return (
      <ErrorPanel
        error={profile.error ?? dictionaries.error}
        retry={() => {
          void profile.refetch();
          void dictionaries.refetch();
        }}
      />
    );
  const person = profile.data;
  const dictionary = dictionaries.data;
  const specialization = dictionary.specializations.find(
    (item) => item.id === person.specializationId,
  )?.label;
  const experience = dictionary.experienceLevels.find(
    (item) => item.id === person.experienceId,
  )?.label;
  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-muted-foreground">
            {edit
              ? "Расскажите о себе"
              : personId
                ? "Профессиональный профиль"
                : "Ваше пространство"}
          </p>
          <h1 className="text-3xl font-bold">
            {edit ? "Профиль" : person.displayName || "Пока без имени"}
          </h1>
        </div>
        {!personId && !edit && (
          <Button asChild variant="outline">
            <Link to="/profile/edit">Редактировать</Link>
          </Button>
        )}
      </div>
      {edit ? (
        <ProfileForm profile={person} dictionaries={dictionary} />
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex gap-4">
              <span
                className="flex size-16 items-center justify-center rounded-lg bg-muted text-2xl font-bold"
                aria-hidden="true"
              >
                {person.displayName.slice(0, 1) || "А"}
              </span>
              <div>
                <h2 className="text-xl font-bold">
                  {person.displayName || "Профиль ещё не заполнен"}
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {[specialization, experience].filter(Boolean).join(" · ") ||
                    "Специализация пока не указана"}
                </p>
              </div>
            </div>
            <p className="mt-6 whitespace-pre-wrap">
              {person.bio ||
                "Здесь появится рассказ о профессиональных интересах."}
            </p>
            <h3 className="mb-3 mt-8 font-bold">Навыки</h3>
            <div className="flex flex-wrap gap-2">
              {dictionary.skills
                .filter((item) => person.skillIds.includes(item.id))
                .map((item) => (
                  <span
                    className="rounded-full bg-muted px-3 py-1"
                    key={item.id}
                  >
                    {item.label}
                  </span>
                ))}
            </div>
            <h3 className="mb-3 mt-8 font-bold">Интересы</h3>
            <div className="flex flex-wrap gap-2">
              {dictionary.goals
                .filter((item) => person.goalIds.includes(item.id))
                .map((item) => (
                  <span
                    className="rounded-full border border-border px-3 py-1"
                    key={item.id}
                  >
                    {item.label}
                  </span>
                ))}
            </div>
            {person.portfolioLinks.length > 0 && (
              <div className="mt-8 grid gap-2">
                {person.portfolioLinks.map((link) => (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline"
                  >
                    {link}
                  </a>
                ))}
              </div>
            )}
          </section>
          <aside className="self-start rounded-xl border border-border bg-card p-6">
            {!personId ? (
              <>
                <h2 className="font-bold">Готовность профиля</h2>
                <p className="mt-3 text-muted-foreground">
                  {person.complete
                    ? "Обязательные поля заполнены."
                    : "Добавьте имя, специализацию, навыки и цель."}
                </p>
                <p className="mt-4">
                  Поиск людей: {person.discoverable ? "включён" : "выключен"}
                </p>
                <div className="mt-6 grid gap-3">
                  <Link className="underline" to="/my-projects">
                    Мои проекты
                  </Link>
                  <Link className="underline" to="/applications">
                    Мои заявки
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-bold">От знакомства к работе</h2>
                <p className="mt-3 text-muted-foreground">
                  Личная переписка появляется после взаимного интереса. Заявки в
                  проекты от совпадений не зависят.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

import { Link, useParams } from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import {
  useProject,
  useProjectChat,
  useProjectDictionaries,
  useProjectParticipation,
} from "@web/entities/project/queries";
import {
  ApplyForm,
  ApplicationList,
} from "@web/features/projects/Applications";
import {
  LeaveProject,
  Recruitment,
  Roster,
} from "@web/features/projects/Roster";
import { ProjectHeading, ProjectNav } from "@web/features/projects/ui";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";

export function ProjectDetailPage({ manage = false }: { manage?: boolean }) {
  const { projectId = "" } = useParams();
  const session = useSession();
  const query = useProject(projectId);
  const dictionaries = useProjectDictionaries();
  const owner = !!session.me && query.data?.ownerId === session.me.id;
  const participation = useProjectParticipation(projectId, owner);
  const chat = useProjectChat(projectId, !!participation.data?.member);
  if (query.isError)
    return (
      <ErrorPanel
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  if (!query.data || !session.me) return <Loading />;
  const project = query.data;
  if (manage && !owner)
    return (
      <Empty title="Управление недоступно">
        Управлять может только текущий владелец.{" "}
        <Link className="underline" to={`/projects/${project.id}`}>
          К проекту
        </Link>
      </Empty>
    );
  return (
    <>
      <ProjectNav />
      <div className="mb-6 flex flex-wrap justify-between gap-3">
        <Link className="underline" to="/projects">
          ← Все проекты
        </Link>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching || participation.isFetching}
          onClick={() => {
            void query.refetch();
            void participation.refetch();
            if (participation.data?.member) void chat.refetch();
          }}
        >
          Обновить проект и мой доступ
        </Button>
      </div>
      <div className="mb-8 rounded-xl bg-[#e5e9dd] p-6 md:p-10">
        <p className="mb-4 font-mono text-xs uppercase tracking-widest">
          {dictionaries.data?.goals.find((goal) => goal.id === project.goalId)
            ?.label ?? project.goalId}
        </p>
        <ProjectHeading
          label={project.recruitmentOpen ? "НАБОР ОТКРЫТ" : "НАБОР ЗАКРЫТ"}
          title={project.title}
        />
        <p className="text-muted-foreground">Идея, которая становится общей.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-6 rounded-xl border border-border bg-card p-5 md:p-7">
            <h2 className="text-xl font-semibold">О проекте</h2>
            <p className="whitespace-pre-wrap break-words">
              {project.description}
            </p>
            <h3 className="font-semibold">Кого ищем</h3>
            <ul className="flex flex-wrap gap-2">
              {project.requiredRoles.map((role, index) => (
                <li
                  className="rounded-full border border-border px-3 py-2 break-words"
                  key={index}
                >
                  {role}
                </li>
              ))}
            </ul>
            <h3 className="font-semibold">С чем работаем</h3>
            <ul className="flex flex-wrap gap-2">
              {project.requiredSkillIds.map((id) => (
                <li
                  key={id}
                  className="rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {dictionaries.data?.skills.find((skill) => skill.id === id)
                    ?.label ?? id}
                </li>
              ))}
            </ul>
          </section>
          <Roster project={project} owner={owner} actorId={session.me.id} />
          {manage && owner && (
            <>
              <Recruitment project={project} />
              <ApplicationList key={project.id} project={project} />
            </>
          )}
        </div>
        <aside className="space-y-5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
          {owner ? (
            <>
              <h2 className="text-xl font-semibold">
                У хорошей идеи есть команда.
              </h2>
              <p className="text-muted-foreground">
                Заявки, состав и настройки набора — в управлении проектом.
              </p>
              <Button asChild>
                <Link to={`/projects/${project.id}/manage`}>
                  Управлять проектом
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/projects/${project.id}/edit`}>Редактировать</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Чтобы покинуть команду, сначала передайте владение существующему
                участнику в списке команды.
              </p>
            </>
          ) : participation.isPending ? (
            <Loading />
          ) : participation.isError ? (
            <ErrorPanel
              error={participation.error}
              retry={() => {
                void participation.refetch();
              }}
            />
          ) : participation.data.member ? (
            <>
              <h2 className="text-xl font-semibold">Вы в команде</h2>
              <p className="text-muted-foreground">
                Продолжайте вместе. Обсудите следующий шаг в командной
                переписке.
              </p>
              <LeaveProject projectId={project.id} />
            </>
          ) : participation.data.pending ? (
            <>
              <h2 className="text-xl font-semibold">Заявка на рассмотрении</h2>
              <Link className="underline" to="/applications">
                Мои заявки · отзыв и история
              </Link>
            </>
          ) : !project.recruitmentOpen ? (
            <>
              <h2 className="text-xl font-semibold">
                Сейчас без новых участников
              </h2>
              <p className="text-muted-foreground">
                Набор закрыт. Можно познакомиться с другими проектами.
              </p>
            </>
          ) : !session.me.profile.complete ? (
            <>
              <h2 className="text-xl font-semibold">
                Давайте сначала познакомимся
              </h2>
              <Link className="underline" to="/profile/edit">
                Заполните профиль перед подачей заявки
              </Link>
            </>
          ) : (
            <ApplyForm projectId={project.id} />
          )}
          {participation.data?.member && (
            <div className="space-y-3 border-t border-border pt-5">
              {chat.isPending && <Loading />}
              {chat.isError && (
                <ErrorPanel
                  error={chat.error}
                  retry={() => {
                    if (participation.data?.member) void chat.refetch();
                  }}
                />
              )}
              {chat.data ? (
                <Button asChild>
                  <Link to={`/messages/${chat.data}`}>В чат проекта</Link>
                </Button>
              ) : (
                chat.isSuccess && (
                  <p className="text-sm text-muted-foreground">
                    Командная переписка пока недоступна. Обновите доступ к
                    проекту.
                  </p>
                )
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
export function ProjectManagePage() {
  return <ProjectDetailPage manage />;
}

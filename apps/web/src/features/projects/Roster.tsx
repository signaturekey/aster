import { useState } from "react";
import { Link } from "react-router-dom";
import type { Member, Project } from "@web/entities/project/types";
import { dedupeRows } from "@web/entities/project/helpers";
import {
  projectApi,
  useProjectAction,
  useRoster,
} from "@web/entities/project/queries";
import { unwrap } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel, Loading } from "@web/shared/ui/feedback";
import { Confirm, More, ProjectError } from "@web/features/projects/ui";

export function Roster({
  project,
  owner,
  actorId,
}: {
  project: Project;
  owner: boolean;
  actorId: string;
}) {
  const query = useRoster(project.id);
  const action = useProjectAction();
  const [confirmation, setConfirmation] = useState<{
    kind: "remove" | "transfer";
    member: Member;
  } | null>(null);
  const rows = dedupeRows(query.data?.pages, (member) => member.userId);
  const perform = () => {
    if (!confirmation) return;
    const { kind, member } = confirmation;
    void action.execute(
      async (signal) => {
        if (kind === "remove")
          await unwrap(
            projectApi(project.id)
              .members({ userId: member.userId })
              .delete(undefined, { fetch: { signal } }),
          );
        else
          await unwrap(
            projectApi(project.id)["transfer-ownership"].post(
              { userId: member.userId },
              { fetch: { signal } },
            ),
          );
      },
      () => {
        setConfirmation(null);
      },
    );
  };
  return (
    <section className="rounded-xl border border-border bg-card p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Команда</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Обновить состав
        </Button>
      </div>
      {query.isPending && <Loading />}
      {query.isError && (
        <ErrorPanel
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      <ProjectError error={action.error} />
      <ul className="divide-y divide-border">
        {rows.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-4 py-4"
          >
            <div className="min-w-0">
              <Link
                to={`/people/${member.userId}`}
                className="break-words font-semibold underline"
              >
                {member.profile.displayName || "Участник"}
                {member.userId === actorId ? " · вы" : ""}
              </Link>
              <p className="text-sm text-muted-foreground">
                {member.role === "owner" ? "Владелец проекта" : "Участник"}
              </p>
            </div>
            {owner && member.role !== "owner" && member.userId !== actorId && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => {
                    action.reset();
                    setConfirmation({ kind: "transfer", member });
                  }}
                >
                  Передать проект
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={action.isPending}
                  onClick={() => {
                    action.reset();
                    setConfirmation({ kind: "remove", member });
                  }}
                >
                  Удалить
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <More {...query} />
      <Confirm
        open={!!confirmation}
        onClose={() => setConfirmation(null)}
        title={
          confirmation?.kind === "transfer"
            ? "Передать владение проектом?"
            : "Удалить участника?"
        }
        pending={action.isPending}
        error={action.error}
        onConfirm={perform}
      >
        {confirmation?.kind === "transfer"
          ? `Новым владельцем станет ${confirmation.member.profile.displayName || "выбранный участник"}. Вы останетесь участником, но потеряете управление проектом и заявками.`
          : "Участник потеряет доступ к командной переписке. Принятая заявка в истории не восстановит участие."}
      </Confirm>
    </section>
  );
}
export function LeaveProject({ projectId }: { projectId: string }) {
  const [confirm, setConfirm] = useState(false);
  const action = useProjectAction();
  return (
    <>
      <Button
        variant="destructive"
        disabled={action.isPending}
        onClick={() => setConfirm(true)}
      >
        Покинуть команду
      </Button>
      <ProjectError error={action.error} />
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Покинуть команду?"
        pending={action.isPending}
        error={action.error}
        onConfirm={() => {
          void action.execute(
            (signal) =>
              unwrap(
                projectApi(projectId).members.me.delete(undefined, {
                  fetch: { signal },
                }),
              ),
            () => {
              setConfirm(false);
            },
          );
        }}
      >
        Переписка станет недоступна. Для возвращения потребуется новая принятая
        заявка. Прежнее решение в истории не восстановит участие.
      </Confirm>
    </>
  );
}
export function Recruitment({ project }: { project: Project }) {
  const action = useProjectAction();
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <h2 className="text-xl font-semibold">
        {project.recruitmentOpen ? "Набор открыт" : "Набор закрыт"}
      </h2>
      <p className="text-muted-foreground">
        Закрытие блокирует новые заявки и принятие ожидающих. Команда, история и
        существующие заявки сохраняются.
      </p>
      <Button
        variant="outline"
        disabled={action.isPending}
        onClick={() => {
          void action.execute((signal) =>
            unwrap(
              projectApi(project.id).patch(
                { recruitmentOpen: !project.recruitmentOpen },
                { fetch: { signal } },
              ),
            ),
          );
        }}
      >
        {action.isPending
          ? "Сохраняем…"
          : project.recruitmentOpen
            ? "Закрыть набор"
            : "Открыть набор"}
      </Button>
      <ProjectError error={action.error} />
    </section>
  );
}

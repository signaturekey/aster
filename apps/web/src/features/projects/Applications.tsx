import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import type { Application, Project } from "@web/entities/project/types";
import {
  applicationActions,
  applicationLabels,
  dedupeRows,
  validateText,
} from "@web/entities/project/helpers";
import {
  applicationApi,
  projectApi,
  useApplications,
  useProjectAction,
} from "@web/entities/project/queries";
import { unwrap } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";
import {
  Empty,
  ErrorPanel,
  Field,
  inputClass,
  Loading,
} from "@web/shared/ui/feedback";
import { More, ProjectError, useDirtyWarning } from "@web/features/projects/ui";

export function ApplyForm({ projectId }: { projectId: string }) {
  const action = useProjectAction();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<{ text: string }>({ defaultValues: { text: "" } });
  useDirtyWarning(isDirty);
  const submit = handleSubmit(async (values) => {
    await action.execute(
      (signal) =>
        unwrap(
          projectApi(projectId).applications.post(values, {
            fetch: { signal },
          }),
        ),
      () => {
        reset();
      },
    );
  });
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid gap-4"
    >
      <h2 className="text-xl font-semibold">Есть общий интерес?</h2>
      <p className="text-muted-foreground">
        Расскажите, чем вам близка идея и какой вклад хочется внести. Совпадение
        с человеком не требуется.
      </p>
      <Field
        label="Несколько слов команде · до 2000 символов"
        error={errors.text?.message}
      >
        <textarea
          rows={6}
          className={inputClass}
          disabled={action.isPending}
          {...register("text", {
            validate: (text) => validateText(text, 2000),
          })}
        />
      </Field>
      <ProjectError error={action.error} />
      <Button disabled={action.isPending}>
        {action.isPending ? "Отправляем…" : "Отправить заявку"}
      </Button>
    </form>
  );
}
function ApplicationCard({
  application,
  project,
}: {
  application: Application;
  project?: Project;
}) {
  const action = useProjectAction();
  const controls = applicationActions(
    application.state,
    !!project,
    project?.recruitmentOpen ?? false,
  );
  const transition = (kind: "accept" | "reject" | "withdraw") => {
    void action.execute((signal) =>
      unwrap(
        applicationApi(application.id)[kind].post(undefined, {
          fetch: { signal },
        }),
      ),
    );
  };
  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <Link
          className="font-semibold underline"
          to={
            project
              ? `/people/${application.userId}`
              : `/projects/${application.projectId}`
          }
        >
          {project ? "Профиль кандидата" : "Открыть проект"}
        </Link>
        <span className="rounded-full bg-muted px-3 py-1 text-sm">
          {applicationLabels[application.state]}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(application.createdAt).toLocaleString("ru-RU")}
      </p>
      <p className="whitespace-pre-wrap break-words">{application.text}</p>
      <ProjectError error={action.error} />
      <div className="flex flex-wrap gap-3">
        {controls.accept && (
          <Button
            disabled={action.isPending}
            onClick={() => transition("accept")}
          >
            Принять
          </Button>
        )}
        {controls.reject && (
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => transition("reject")}
          >
            Отклонить
          </Button>
        )}
        {controls.withdraw && (
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => transition("withdraw")}
          >
            Отозвать заявку
          </Button>
        )}
        {!project && ["rejected", "withdrawn"].includes(application.state) && (
          <Link className="underline" to={`/projects/${application.projectId}`}>
            Подать заново, если набор открыт
          </Link>
        )}
      </div>
      {!project && application.state === "accepted" && (
        <p className="text-sm text-muted-foreground">
          Это история решения, а не подтверждение текущего участия. Актуальная
          команда — на странице проекта.
        </p>
      )}
    </article>
  );
}
export function ApplicationList({ project }: { project?: Project }) {
  const query = useApplications(project?.id);
  const rows = dedupeRows(query.data?.pages, (item) => item.id);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {project ? "Заявки в проект" : "История заявок"}
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Обновить заявки
        </Button>
      </div>
      {project && !project.recruitmentOpen && (
        <p className="text-muted-foreground">
          Набор закрыт. Ожидающие заявки сохранены; принятие станет доступно
          после открытия набора.
        </p>
      )}
      {query.isPending && <Loading />}
      {query.isError && (
        <ErrorPanel
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.isSuccess && !rows.length && (
        <Empty title="Заявок пока нет">
          Здесь появится история реальных обращений.
        </Empty>
      )}
      <div className="grid gap-4">
        {rows.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            {...(project ? { project } : {})}
          />
        ))}
      </div>
      <More {...query} />
    </section>
  );
}

import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import type { Dictionaries, Project } from "@web/entities/project/types";
import {
  projectPayload,
  validateRoles,
  validateSkills,
  validateText,
  type ProjectValues,
} from "@web/entities/project/helpers";
import { projectApi, useProjectAction } from "@web/entities/project/queries";
import { api } from "@web/shared/api/client";
import { unwrap } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";
import { Field, inputClass } from "@web/shared/ui/feedback";
import { ProjectError, useDirtyWarning } from "@web/features/projects/ui";

export function ProjectForm({
  project,
  dictionaries,
}: {
  project?: Project;
  dictionaries: Dictionaries;
}) {
  const navigate = useNavigate();
  const action = useProjectAction();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProjectValues>({
    defaultValues: {
      title: project?.title ?? "",
      description: project?.description ?? "",
      goalId: project?.goalId ?? "",
      roles: project?.requiredRoles.join("\n") ?? "",
      requiredSkillIds: project?.requiredSkillIds ?? [],
      recruitmentOpen: project?.recruitmentOpen ?? true,
    },
  });
  const acknowledgeSaved = useDirtyWarning(isDirty);
  const submit = handleSubmit(async (values) => {
    await action.execute(
      (signal) =>
        project
          ? unwrap(
              projectApi(project.id).patch(
                {
                  ...projectPayload(values),
                  recruitmentOpen: values.recruitmentOpen,
                },
                { fetch: { signal } },
              ),
            )
          : unwrap(
              api.api.v1.projects.post(projectPayload(values), {
                fetch: { signal },
              }),
            ),
      async (saved) => {
        acknowledgeSaved();
        reset(values);
        await navigate(`/projects/${saved.id}`);
      },
    );
  });
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid max-w-3xl gap-6 rounded-xl border border-border bg-card p-5 md:p-8"
    >
      <fieldset disabled={action.isPending} className="grid gap-6">
        <Field label="Название · до 120 символов" error={errors.title?.message}>
          <input
            className={inputClass}
            {...register("title", {
              validate: (value) => validateText(value, 120),
            })}
          />
        </Field>
        <Field label="Формат" error={errors.goalId?.message}>
          <select
            className={inputClass}
            {...register("goalId", { required: "Выберите формат." })}
          >
            <option value="">Выберите формат</option>
            {dictionaries.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="О чём проект · до 5000 символов"
          error={errors.description?.message}
        >
          <textarea
            rows={8}
            className={inputClass}
            {...register("description", {
              validate: (value) => validateText(value, 5000),
            })}
          />
        </Field>
        <Field
          label="Кого ищете · от 1 до 10 ролей, по одной на строку, до 80 символов"
          error={errors.roles?.message}
        >
          <textarea
            rows={4}
            className={inputClass}
            {...register("roles", { validate: validateRoles })}
          />
        </Field>
        <fieldset>
          <legend className="mb-3 font-semibold">Нужные навыки · до 20</legend>
          <div className="flex flex-wrap gap-2">
            {dictionaries.skills.map((skill) => (
              <label
                key={skill.id}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  value={skill.id}
                  {...register("requiredSkillIds", {
                    validate: validateSkills,
                  })}
                />
                {skill.label}
              </label>
            ))}
          </div>
          {errors.requiredSkillIds && (
            <p role="alert">{errors.requiredSkillIds.message}</p>
          )}
        </fieldset>
        {project ? (
          <label className="flex items-center gap-3">
            <input type="checkbox" {...register("recruitmentOpen")} />
            Набор открыт
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">
            Новый проект открывает набор. Закрыть его можно в управлении. Для
            создания нужен полный профиль.
          </p>
        )}
        <ProjectError error={action.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit">
            {action.isPending
              ? "Сохраняем…"
              : project
                ? "Сохранить изменения"
                : "Создать проект"}
          </Button>
          <Button asChild variant="ghost">
            <Link to={project ? `/projects/${project.id}` : "/projects"}>
              Отмена
            </Link>
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

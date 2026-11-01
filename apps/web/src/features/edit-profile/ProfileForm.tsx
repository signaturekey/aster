import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@web/shared/lib/session-context";
import type {
  Dictionaries,
  Profile,
  ProfilePatch,
} from "@web/entities/profile/queries";
import { api } from "@web/shared/api/client";
import { unwrap } from "@web/shared/api/errors";
import { parseLinks, validateLinks, within } from "@web/shared/lib/forms";
import { useUnsavedWarning } from "@web/shared/lib/use-unsaved-warning";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel, Field, inputClass } from "@web/shared/ui/feedback";

type Values = {
  displayName: string;
  bio: string;
  specializationId: string;
  experienceId: string;
  skillIds: string[];
  goalIds: string[];
  links: string;
  discoverable: boolean;
};
export function ProfileForm({
  profile,
  dictionaries,
}: {
  profile: Profile;
  dictionaries: Dictionaries;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<Values>({
    defaultValues: {
      ...profile,
      specializationId: profile.specializationId ?? "",
      experienceId: profile.experienceId ?? "",
      links: profile.portfolioLinks.join("\n"),
    },
  });
  const acknowledgeSaved = useUnsavedWarning(isDirty);
  const submit = handleSubmit(async (values) => {
    setError(null);
    const payload: ProfilePatch = {
      displayName: values.displayName,
      bio: values.bio,
      specializationId: values.specializationId || null,
      experienceId: values.experienceId || null,
      skillIds: values.skillIds,
      goalIds: values.goalIds,
      portfolioLinks: parseLinks(values.links),
      discoverable: values.discoverable,
    };
    try {
      await session.run((signal) =>
        unwrap(api.api.v1.me.profile.patch(payload, { fetch: { signal } })),
      );
      acknowledgeSaved();
      reset(values);
      await queryClient.invalidateQueries();
      await session.refresh();
      await navigate("/profile");
    } catch (error) {
      setError(error);
    }
  });
  return (
    <form
      className="grid max-w-2xl gap-5 rounded-xl border border-border bg-card p-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <Field label="Имя" error={errors.displayName?.message}>
        <input
          className={inputClass}
          {...register("displayName", {
            validate: (value) => within(value, 80),
          })}
        />
      </Field>
      <Field label="О себе" error={errors.bio?.message}>
        <textarea
          rows={5}
          className={inputClass}
          {...register("bio", { validate: (value) => within(value, 2000) })}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Специализация">
          <select className={inputClass} {...register("specializationId")}>
            <option value="">Пока не выбрана</option>
            {dictionaries.specializations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Опыт">
          <select className={inputClass} {...register("experienceId")}>
            <option value="">Пока не выбран</option>
            {dictionaries.experienceLevels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-3 font-semibold">Навыки · до 20</legend>
        <div className="flex flex-wrap gap-3">
          {dictionaries.skills.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                value={item.id}
                {...register("skillIds", {
                  validate: (value) =>
                    value.length <= 20 || "Выберите не больше 20 навыков.",
                })}
              />
              {item.label}
            </label>
          ))}
        </div>
        {errors.skillIds && <p role="alert">{errors.skillIds.message}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-3 font-semibold">Цели · до 5</legend>
        <div className="flex flex-wrap gap-3">
          {dictionaries.goals.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                value={item.id}
                {...register("goalIds", {
                  validate: (value) =>
                    value.length <= 5 || "Выберите не больше 5 целей.",
                })}
              />
              {item.label}
            </label>
          ))}
        </div>
        {errors.goalIds && <p role="alert">{errors.goalIds.message}</p>}
      </fieldset>
      <Field
        label="Портфолио · одна ссылка на строку"
        error={errors.links?.message}
      >
        <textarea
          rows={3}
          className={inputClass}
          {...register("links", { validate: validateLinks })}
        />
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" {...register("discoverable")} />
        <span>Участвовать в поиске людей</span>
      </label>
      <p className="text-sm text-muted-foreground">
        Для полного профиля нужны имя, специализация, хотя бы один навык и одна
        цель. Участие в поиске включается отдельно.
      </p>
      {error !== null && <ErrorPanel error={error} />}
      <Button disabled={isSubmitting}>
        {isSubmitting ? "Сохраняем…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}

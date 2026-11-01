import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import { auth } from "@web/shared/api/client";
import { responseError } from "@web/shared/api/errors";
import { nonblank, safeReturnPath, within } from "@web/shared/lib/forms";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel, Field, inputClass } from "@web/shared/ui/feedback";

type Values = {
  name: string;
  email: string;
  password: string;
  confirmation: string;
};
export function AuthPage({
  register: registration = false,
}: {
  register?: boolean;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    getValues,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Values>();
  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await session.authenticate(async (signal) => {
        const result = registration
          ? await auth.signUp.email(
              {
                name: values.name,
                email: values.email,
                password: values.password,
              },
              { signal },
            )
          : await auth.signIn.email(
              {
                email: values.email,
                password: values.password,
              },
              { signal },
            );
        if (result.error)
          throw responseError(result.error.status, result.error);
      });
      resetField("password");
      resetField("confirmation");
      if (me)
        await navigate(
          registration && !me.profile.complete
            ? "/onboarding"
            : safeReturnPath(search.get("returnTo")),
        );
    } catch (error) {
      setError(error);
    }
  });
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-12 md:grid-cols-2">
      <section>
        <Link to="/" className="wordmark">
          aster<span>.</span>
        </Link>
        <h1 className="mt-10 font-display text-4xl italic">
          Начните с людей.
          <br />
          Создайте что-то вместе.
        </h1>
        <p className="mt-6 max-w-sm text-muted-foreground">
          Найдите соавторов для стартапа, хакатона или своего следующего
          проекта.
        </p>
      </section>
      <section className="rounded-xl border border-border bg-card p-6 md:p-8">
        <h2 className="text-2xl font-bold">
          {registration ? "Создать аккаунт" : "С возвращением"}
        </h2>
        <p className="mb-6 mt-2 text-muted-foreground">
          {registration
            ? "Ваша следующая команда начинается здесь."
            : "Войдите, чтобы продолжить совместную работу."}
        </p>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {registration && (
            <Field label="Имя" error={errors.name?.message}>
              <input
                className={inputClass}
                autoComplete="name"
                {...register("name", {
                  validate: { nonblank, length: (value) => within(value, 80) },
                })}
              />
            </Field>
          )}
          <Field label="Почта" error={errors.email?.message}>
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              {...register("email", { required: "Укажите почту." })}
            />
          </Field>
          <Field label="Пароль" error={errors.password?.message}>
            <input
              className={inputClass}
              type="password"
              autoComplete={registration ? "new-password" : "current-password"}
              {...register("password", {
                required: "Введите пароль.",
                ...(registration
                  ? {
                      minLength: { value: 8, message: "Не меньше 8 символов." },
                      maxLength: {
                        value: 128,
                        message: "Не больше 128 символов.",
                      },
                    }
                  : {}),
              })}
            />
          </Field>
          {registration && (
            <Field
              label="Повторите пароль"
              error={errors.confirmation?.message}
            >
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                {...register("confirmation", {
                  validate: (value) =>
                    value === getValues("password") || "Пароли не совпадают.",
                })}
              />
            </Field>
          )}
          {error !== null && <ErrorPanel error={error} />}
          <Button size="lg" disabled={isSubmitting}>
            {isSubmitting
              ? "Подождите…"
              : registration
                ? "Зарегистрироваться"
                : "Войти"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          {registration ? "Уже есть аккаунт?" : "Пока нет аккаунта?"}{" "}
          <Link
            className="font-semibold text-foreground underline"
            to={registration ? "/sign-in" : "/sign-up"}
          >
            {registration ? "Войти" : "Зарегистрироваться"}
          </Link>
        </p>
      </section>
    </main>
  );
}

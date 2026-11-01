import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { errorMessage } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";

export function ErrorPanel({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[#a0342d]/30 bg-card p-5"
    >
      <p>{errorMessage(error)}</p>
      {retry && (
        <Button className="mt-3" variant="outline" onClick={retry}>
          Попробовать снова
        </Button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <p role="status" className="py-8 text-muted-foreground">
      Загружаем…
    </p>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 text-muted-foreground">{children}</div>
    </section>
  );
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          "aria-invalid"?: boolean;
          "aria-describedby"?: string;
        }>,
        {
          id,
          "aria-invalid": !!error,
          ...(error ? { "aria-describedby": `${id}-error` } : {}),
        },
      )
    : children;
  return (
    <div className="grid gap-2 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {control}
      {error && (
        <span
          id={`${id}-error`}
          role="alert"
          className="font-normal text-[#a0342d]"
        >
          {error}
        </span>
      )}
    </div>
  );
}
export const inputClass =
  "w-full rounded-md border border-border bg-card px-3 py-3 text-sm font-normal disabled:opacity-60";

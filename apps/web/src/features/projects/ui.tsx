import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel } from "@web/shared/ui/feedback";
import { projectErrorHint } from "@web/entities/project/helpers";

export function ProjectHeading({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">
          {label}
        </p>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight break-words md:text-[32px]">
          {title}
        </h1>
      </div>
      {children}
    </header>
  );
}
export function ProjectNav() {
  return (
    <nav
      aria-label="Разделы проектов"
      className="mb-6 flex flex-wrap gap-4 text-sm font-semibold"
    >
      <Link to="/projects">Все проекты</Link>
      <Link to="/my-projects">Мои команды</Link>
      <Link to="/applications">Мои заявки</Link>
    </nav>
  );
}
export function ProjectError({ error }: { error: unknown }) {
  if (!error) return null;
  const hint = projectErrorHint(error);
  return (
    <div className="space-y-2">
      <ErrorPanel error={error} />
      {hint && (
        <p role="status" className="text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
export function More({
  hasNextPage,
  isFetching,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  return hasNextPage ? (
    <div className="mt-6 text-center">
      <Button
        variant="outline"
        disabled={isFetching}
        onClick={() => {
          void fetchNextPage();
        }}
      >
        {isFetching ? "Загружаем…" : "Показать ещё"}
      </Button>
    </div>
  ) : null;
}
export function Confirm({
  open,
  onClose,
  title,
  children,
  pending,
  onConfirm,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  pending: boolean;
  onConfirm: () => void;
  error?: unknown;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl"
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // A controlled dialog has no Radix Trigger to restore focus to.
            event.preventDefault();
            if (previousFocus.current?.isConnected)
              previousFocus.current.focus();
            else document.getElementById("content")?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Description className="my-4 text-muted-foreground">
            {children}
          </Dialog.Description>
          <ProjectError error={error} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? "Выполняем…" : "Подтвердить"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export { useUnsavedWarning as useDirtyWarning } from "@web/shared/lib/use-unsaved-warning";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { ConversationPage } from "@web/entities/conversation/types";
import { useSession } from "@web/shared/lib/session-context";
import {
  accessDenied,
  conversationKeys,
  useConversation,
  useMessages,
} from "@web/entities/conversation/queries";
import {
  conversationTitle,
  mergeMessages,
} from "@web/entities/conversation/reconcile";
import { Composer, useSendMessage } from "@web/features/messages/Composer";
import { useOutbox } from "@web/features/messages/outbox";
import { errorMessage } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";

const time = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Thread({ conversationId }: { conversationId: string }) {
  const { me, scope } = useSession();
  const client = useQueryClient();
  const [writeDenied, setWriteDenied] = useState(false);
  const detail = useConversation(conversationId, !writeDenied);
  const history = useMessages(
    conversationId,
    !!detail.data && !detail.error && !writeDenied,
  );
  const { box, attempts } = useOutbox(scope);
  const denied =
    writeDenied || accessDenied(detail.error) || accessDenied(history.error);
  const send = useSendMessage(() => setWriteDenied(true));
  const pages = history.data?.pages;
  const merged = mergeMessages(
    pages ?? [],
    attempts.filter((attempt) => attempt.conversationId === conversationId),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const position = useRef<{ bottom: boolean; id?: string; offset?: number }>({
    bottom: true,
  });
  const recordPosition = () => {
    const node = scroller.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top;
    const first = [
      ...node.querySelectorAll<HTMLElement>("[data-message-key]"),
    ].find((item) => item.getBoundingClientRect().bottom > top);
    position.current = {
      bottom: node.scrollHeight - node.scrollTop - node.clientHeight < 64,
      ...(first
        ? {
            id: first.dataset.messageKey!,
            offset: first.getBoundingClientRect().top - top,
          }
        : {}),
    };
  };
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const previous = position.current;
    if (previous.bottom) node.scrollTop = node.scrollHeight;
    else if (previous.id) {
      const anchor = [
        ...node.querySelectorAll<HTMLElement>("[data-message-key]"),
      ].find((item) => item.dataset.messageKey === previous.id);
      if (anchor)
        node.scrollTop +=
          anchor.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          (previous.offset ?? 0);
    }
    recordPosition();
  }, [pages, attempts, detail.data]);
  useEffect(() => {
    if (pages) box.prune(pages.flatMap((page) => page.items));
  }, [box, pages]);
  useEffect(() => {
    if (!denied || !me) return;
    setWriteDenied(true);
    // A resource denial is not logout. Remove private history and attempts, and
    // keep the denial visible instead of rendering stale successful Query data.
    void client.cancelQueries({
      queryKey: conversationKeys.history(me.id, conversationId),
    });
    client.removeQueries({
      queryKey: conversationKeys.history(me.id, conversationId),
    });
    client.removeQueries({
      queryKey: conversationKeys.detail(me.id, conversationId),
    });
    box.clearThread(conversationId);
    scope.setDraft(`message:${conversationId}`, "");
    client.setQueryData<InfiniteData<ConversationPage>>(
      conversationKeys.list(me.id),
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== conversationId),
              })),
            }
          : undefined,
    );
  }, [denied, me?.id, conversationId, client, box, scope]);

  const header = (
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4">
      <Link
        to="/messages"
        className="rounded-full p-2 md:hidden"
        aria-label="К списку переписок"
      >
        ←
      </Link>
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-lg font-bold">
          {detail.data && !denied
            ? conversationTitle(detail.data)
            : "Переписка"}
        </h2>
        {detail.data && !denied && (
          <p className="text-xs text-muted-foreground">
            {detail.data.kind === "direct"
              ? "Личная переписка"
              : "Командный разговор"}{" "}
            · сохранённая история
          </p>
        )}
      </div>
      {detail.data && !denied && (
        <Link
          className="text-sm underline underline-offset-4"
          to={
            detail.data.kind === "project"
              ? `/projects/${detail.data.projectId}`
              : `/people/${detail.data.peer.userId}`
          }
        >
          {detail.data.kind === "project" ? "К проекту" : "Профиль"}
        </Link>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          void detail.refetch();
          void history.refetch();
        }}
      >
        Обновить
      </Button>
    </header>
  );
  if (denied)
    return (
      <section>
        {header}
        <div className="p-5">
          <Empty title="Переписка недоступна">
            Она не найдена или у вас больше нет доступа. Отправка отключена.
            <p className="mt-3">
              <Link to="/messages" className="underline">
                К перепискам
              </Link>
            </p>
          </Empty>
        </div>
      </section>
    );
  if (detail.isPending)
    return (
      <section>
        {header}
        <div className="p-5">
          <Loading />
        </div>
      </section>
    );
  if (detail.error || !detail.data)
    return (
      <section>
        {header}
        <div className="p-5">
          <ErrorPanel
            error={detail.error}
            retry={() => {
              void detail.refetch();
            }}
          />
        </div>
      </section>
    );
  return (
    <section className="flex min-w-0 flex-col">
      {header}
      <div
        ref={scroller}
        onScroll={recordPosition}
        tabIndex={0}
        aria-label="История сообщений"
        className="message-history min-h-64 flex-1 overflow-y-auto p-4"
        style={{ overflowAnchor: "none" }}
      >
        {history.hasNextPage && (
          <div className="mb-5 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={history.isFetching}
              onClick={() => {
                recordPosition();
                position.current.bottom = false;
                void history.fetchNextPage();
              }}
            >
              {history.isFetchingNextPage
                ? "Загружаем…"
                : "Более ранние сообщения"}
            </Button>
          </div>
        )}
        {history.isPending && <Loading />}
        {history.error && (
          <ErrorPanel
            error={history.error}
            retry={() => {
              void history.refetch();
            }}
          />
        )}
        {!history.isPending &&
          !history.error &&
          !merged.saved.length &&
          !merged.unsaved.length && (
            <Empty title="Начните разговор">
              В этой переписке ещё нет сообщений.
            </Empty>
          )}
        <ol className="grid gap-4">
          {merged.saved.map((message) => (
            <li
              data-message-key={message.id}
              key={message.id}
              className={`flex ${message.senderId === me?.id ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[90%] md:max-w-[80%]">
                <p className="mb-1 text-xs text-muted-foreground">
                  {message.senderId === me?.id
                    ? "Вы"
                    : detail.data.kind === "direct"
                      ? detail.data.peer.displayName
                      : "Участник команды"}
                </p>
                <p
                  className={`whitespace-pre-wrap break-words rounded-lg px-4 py-3 [overflow-wrap:anywhere] ${message.senderId === me?.id ? "bg-[#f2dfd5]" : "bg-muted/60"}`}
                >
                  {message.text}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <time dateTime={message.createdAt}>
                    {time(message.createdAt)}
                  </time>
                  {message.senderId === me?.id ? " · Сохранено" : ""}
                </p>
              </div>
            </li>
          ))}
          {merged.unsaved.map((attempt) => (
            <li
              key={attempt.requestId}
              data-message-key={attempt.requestId}
              className="flex justify-end"
            >
              <div className="max-w-[90%] md:max-w-[80%]">
                <p className="whitespace-pre-wrap break-words rounded-lg border border-dashed border-border bg-[#f2dfd5]/60 px-4 py-3 [overflow-wrap:anywhere]">
                  {attempt.text}
                </p>
                <p role="status" className="mt-1 text-xs text-muted-foreground">
                  {attempt.status === "pending"
                    ? "Сохраняем…"
                    : "Не подтверждено"}
                </p>
                {attempt.status === "failed" && (
                  <div className="mt-2 grid gap-2">
                    <p role="alert" className="text-xs text-[#a0342d]">
                      {errorMessage(attempt.error)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void send(attempt).catch(() => undefined);
                      }}
                    >
                      Повторить тот же текст
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-end"
        onClick={() => {
          const node = scroller.current;
          if (node) node.scrollTop = node.scrollHeight;
          recordPosition();
        }}
      >
        К последним сообщениям ↓
      </Button>
      <Composer
        key={conversationId}
        conversationId={conversationId}
        send={send}
      />
    </section>
  );
}

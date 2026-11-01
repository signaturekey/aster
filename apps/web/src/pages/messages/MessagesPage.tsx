import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@web/shared/lib/session-context";
import {
  reconcileConversations,
  useConversations,
} from "@web/entities/conversation/queries";
import {
  conversationTitle,
  mergeSummaries,
} from "@web/entities/conversation/reconcile";
import { Thread } from "@web/pages/messages/Thread";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";
import "@web/pages/messages/messages.css";

export function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { me, scope } = useSession();
  const client = useQueryClient();
  const list = useConversations();
  const summaries = mergeSummaries(list.data?.pages ?? []);
  const accountId = me?.id;
  const refresh = () => {
    if (accountId)
      void reconcileConversations(
        client,
        accountId,
        undefined,
        scope.signal,
      ).catch(() => undefined);
  };
  useEffect(() => {
    refresh();
  }, [accountId, conversationId]);
  return (
    <>
      <header className="mb-7">
        <p className="mb-3 font-mono text-xs tracking-[0.18em] text-muted-foreground">
          СООБЩЕНИЯ
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Здесь начинается «давай».
        </h1>
        <p className="mt-3 text-muted-foreground">
          Личные знакомства и командные разговоры — в одном месте.
        </p>
      </header>
      <div
        className={`messenger-layout overflow-hidden rounded-xl border border-border bg-card ${conversationId ? "thread-selected" : ""}`}
      >
        <aside
          className="conversation-list min-w-0 border-border md:border-r"
          aria-label="Переписки"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="font-bold">Переписки</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              disabled={list.isFetching}
            >
              Обновить
            </Button>
          </div>
          <div className="conversation-list-scroll overflow-y-auto">
            {list.isPending && (
              <div className="p-4">
                <Loading />
              </div>
            )}
            {list.error && (
              <div className="p-4">
                <ErrorPanel error={list.error} retry={refresh} />
              </div>
            )}
            {!list.error && !list.isPending && !summaries.length && (
              <div className="p-4">
                <Empty title="Переписок пока нет">
                  Познакомьтесь с людьми или вступите в команду.
                  <p className="mt-3">
                    <Link className="underline" to="/discover">
                      Найти людей
                    </Link>
                  </p>
                </Empty>
              </div>
            )}
            <ul>
              {summaries.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/messages/${item.id}`}
                    aria-current={
                      item.id === conversationId ? "page" : undefined
                    }
                    className={`flex min-w-0 gap-3 border-b border-border/60 p-4 transition-colors hover:bg-muted/40 ${item.id === conversationId ? "bg-[#f2dfd5]/50" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${item.kind === "project" ? "bg-[#dce7de]" : "bg-[#f2dfd5]"}`}
                    >
                      {item.kind === "project"
                        ? "#"
                        : conversationTitle(item)
                            .slice(0, 1)
                            .toLocaleUpperCase("ru-RU")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {conversationTitle(item)}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {item.latestMessage?.text ?? "Начните разговор"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.kind === "project" ? "Команда" : "Личная"} ·{" "}
                        <time dateTime={item.lastActivityAt}>
                          {new Date(item.lastActivityAt).toLocaleDateString(
                            "ru-RU",
                            { day: "numeric", month: "short" },
                          )}
                        </time>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="p-4">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={list.isFetching}
                  onClick={() => {
                    void list.fetchNextPage();
                  }}
                >
                  {list.isFetchingNextPage ? "Загружаем…" : "Ещё переписки"}
                </Button>
              </div>
            )}
          </div>
        </aside>
        <div className="conversation-detail min-w-0">
          {conversationId ? (
            <Thread
              key={`${accountId}:${conversationId}`}
              conversationId={conversationId}
            />
          ) : (
            <div className="p-8">
              <Empty title="Выберите переписку">
                Здесь появится сохранённая история разговора. Новые личные
                переписки возникают после взаимного совпадения, командные — при
                участии в проекте.
              </Empty>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
export default MessagesPage;

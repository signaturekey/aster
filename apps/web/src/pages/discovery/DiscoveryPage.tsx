import { useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useSession } from "@web/shared/lib/session-context";
import { loadDictionaries, loadProfile } from "@web/entities/profile/queries";
import {
  discoveryKey,
  filterCount,
  filterProblem,
  filtersToSearch,
  normalizeFilters,
} from "@web/entities/discovery/filters";
import {
  loadDiscovery,
  type DiscoveryPageData,
  type Match,
  type Person,
} from "@web/entities/discovery/queries";
import { FiltersDialog } from "@web/features/discovery/FiltersDialog";
import { PeopleDeck } from "@web/features/discovery/PeopleDeck";
import { ApiError } from "@web/shared/api/errors";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";
import "./discovery.css";

export function DiscoveryPage() {
  const session = useSession();
  return session.me ? (
    <DiscoveryContent key={session.me.id} accountId={session.me.id} />
  ) : null;
}

function DiscoveryContent({ accountId }: { accountId: string }) {
  const session = useSession();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = normalizeFilters(params);
  const problem = filterProblem(filters);
  const [busy, setBusy] = useState(false);
  const decisionFocus = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [match, setMatch] = useState<{ person: Person; match: Match } | null>(
    null,
  );
  const profile = useQuery({
    queryKey: [accountId, "profile", "me"],
    queryFn: () => session.run((signal) => loadProfile(undefined, signal)),
  });
  const dictionaries = useQuery({
    queryKey: [accountId, "dictionaries"],
    queryFn: () => session.run(loadDictionaries),
  });
  const eligible = !!profile.data?.complete && !!profile.data.discoverable;
  const candidates = useInfiniteQuery({
    queryKey: discoveryKey(accountId, filters),
    queryFn: ({ pageParam, signal: querySignal }) =>
      session.run((signal) =>
        loadDiscovery(
          filters,
          pageParam,
          AbortSignal.any([signal, querySignal]),
        ),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: eligible && !problem,
    retry: false,
    refetchOnWindowFocus: !busy,
    refetchOnReconnect: !busy,
    refetchOnMount: "always",
  });
  // Cursor pages can overlap after concurrent profile changes; identity is stable.
  const people = [
    ...new Map(
      candidates.data?.pages
        .flatMap((page) => page.items)
        .map((person) => [person.userId, person]) ?? [],
    ).values(),
  ];
  const resetFilters = () => setParams(filtersToSearch({}, params));
  const refresh = () => {
    // Drop old cursors rather than retrying an invalid later page indefinitely.
    void client.resetQueries({
      queryKey: discoveryKey(accountId, filters),
      exact: true,
    });
    void profile.refetch();
  };
  const serverPrerequisite =
    candidates.error instanceof ApiError &&
    ["PROFILE_INCOMPLETE", "DISCOVERY_DISABLED"].includes(
      candidates.error.code,
    );
  let content;
  if (profile.isPending || dictionaries.isPending) content = <Loading />;
  else if (profile.error || dictionaries.error)
    content = (
      <ErrorPanel
        error={profile.error ?? dictionaries.error}
        retry={() => {
          void profile.refetch();
          void dictionaries.refetch();
        }}
      />
    );
  else if (
    !profile.data.complete ||
    !profile.data.discoverable ||
    serverPrerequisite
  )
    content = (
      <Empty
        title={!profile.data.complete ? "Начнём с вас?" : "Дайте себя найти"}
      >
        <p>
          Для поиска нужны имя, специализация, хотя бы один навык и цель, а
          также включённое участие в поиске. Другие разделы остаются доступны.
        </p>
        <Button asChild className="mt-5">
          <Link to="/profile/edit">Настроить профиль</Link>
        </Button>
        {serverPrerequisite && (
          <Button variant="outline" className="ml-2 mt-5" onClick={refresh}>
            Проверить снова
          </Button>
        )}
      </Empty>
    );
  else if (problem)
    content = (
      <Empty title="Проверьте фильтры">
        <p>{problem}</p>
        <Button className="mt-4" onClick={resetFilters}>
          Сбросить фильтры
        </Button>
      </Empty>
    );
  else if (candidates.isPending) content = <Loading />;
  else if (candidates.error && !people.length)
    content = <ErrorPanel error={candidates.error} retry={refresh} />;
  else if (!people.length)
    content = (
      <Empty
        title={
          candidates.hasNextPage
            ? "В этой части подборки больше нет карточек"
            : filterCount(filters)
              ? "По этим фильтрам пока никого"
              : "Пока всё посмотрели."
        }
      >
        <p>
          {candidates.hasNextPage
            ? "Загрузите следующую часть подборки."
            : "Решения сохраняются и после перезагрузки. Попробуйте другие фильтры, вернитесь позже или загляните к проектам — сброса решений здесь нет."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {filterCount(filters) > 0 && (
            <Button variant="outline" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          )}
          <Button asChild>
            <Link to="/projects">Посмотреть проекты</Link>
          </Button>
        </div>
      </Empty>
    );
  else
    content = (
      <PeopleDeck
        key={JSON.stringify(discoveryKey(accountId, filters))}
        people={people}
        dictionaries={dictionaries.data}
        blocked={!!match || showFilters || candidates.isFetching}
        onBusy={setBusy}
        onConfirmed={(person, result) => {
          // Remove only an acknowledged decision, including other cached filter views.
          client.setQueriesData<InfiniteData<DiscoveryPageData>>(
            { queryKey: [accountId, "discovery"] },
            (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      items: page.items.filter(
                        (item) => item.userId !== person.userId,
                      ),
                    })),
                  }
                : data,
          );
          void client.invalidateQueries({ queryKey: [accountId, "matches"] });
          void client.invalidateQueries({
            queryKey: [accountId, "conversations"],
          });
          if (result.match) setMatch({ person, match: result.match });
        }}
      />
    );

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 font-mono text-xs tracking-wider text-muted-foreground">
            ЛЮДИ
          </p>
          <h1 className="text-3xl font-bold">Хорошие идеи ищут своих.</h1>
          <p className="mt-3 text-muted-foreground">
            Не идеальное резюме. Общий интерес к тому, что будет дальше.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={busy || candidates.isFetching}
            onClick={refresh}
          >
            Обновить
          </Button>
          {dictionaries.data && (
            <FiltersDialog
              filters={filters}
              dictionaries={dictionaries.data}
              disabled={busy}
              onChange={(next) => setParams(filtersToSearch(next, params))}
              open={showFilters}
              onOpenChange={setShowFilters}
            />
          )}
        </div>
      </header>
      <div className="discovery-layout">
        <aside className="discovery-aside">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
            01 / ОБЩИЙ ИНТЕРЕС
          </p>
          <h2 className="mt-4 text-xl font-bold">
            Встретить человека.
            <br />
            Начать что-то своё.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Здесь разработчики, дизайнеры и люди с идеями. Сохраните интерес —
            если он взаимный, вы сможете познакомиться.
          </p>
          <p className="mt-5 text-muted-foreground">
            Сначала разговор. Дальше — решите вместе.
          </p>
          <Link
            className="mt-6 inline-block font-semibold underline"
            to="/matches"
          >
            Ваши совпадения →
          </Link>
        </aside>
        <div
          className="min-w-0 outline-none"
          ref={decisionFocus}
          tabIndex={-1}
          aria-label="Подборка людей"
        >
          {content}
          {eligible && !problem && candidates.hasNextPage && (
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                disabled={busy || candidates.isFetching || !!match}
                onClick={() => {
                  void candidates.fetchNextPage();
                }}
              >
                {candidates.isFetchingNextPage ? "Загружаем…" : "Загрузить ещё"}
              </Button>
            </div>
          )}
          {candidates.error && people.length > 0 && (
            <div className="mt-5">
              <ErrorPanel error={candidates.error} retry={refresh} />
            </div>
          )}
        </div>
        <aside className="discovery-aside discovery-aside-right">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
            02 / ДАЛЬШЕ — ВМЕСТЕ
          </p>
          <h2 className="mt-4 text-xl font-bold">
            Не только что делать.
            <br />
            Но и с кем.
          </h2>
          <p className="mt-4 text-muted-foreground">
            За каждой карточкой — человек с опытом и любопытством. Возможно,
            вашим идеям не хватает друг друга.
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            Взаимный интерес открывает переписку, но не означает вступления в
            проект.
          </p>
        </aside>
      </div>
      <Dialog.Root
        open={!!match}
        onOpenChange={(open) => {
          if (!open) setMatch(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              // This server-triggered dialog has no Dialog.Trigger to restore.
              event.preventDefault();
              decisionFocus.current?.focus();
            }}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-7 shadow-xl"
          >
            <Dialog.Title className="font-display text-3xl italic">
              Вам по пути.
            </Dialog.Title>
            <Dialog.Description className="mt-4 text-muted-foreground">
              {match?.person.displayName} тоже проявляет интерес. Совпадение
              сохранено — теперь можно начать разговор.
            </Dialog.Description>
            {match && (
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild>
                  <Link
                    to={`/messages/${encodeURIComponent(match.match.conversationId)}`}
                  >
                    Начать разговор
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link
                    to={`/people/${encodeURIComponent(match.person.userId)}`}
                  >
                    Профиль
                  </Link>
                </Button>
              </div>
            )}
            <Dialog.Close asChild>
              <Button variant="ghost" className="mt-4">
                Продолжить поиск
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

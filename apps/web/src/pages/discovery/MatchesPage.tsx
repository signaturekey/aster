import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import { loadMatches, type Match } from "@web/entities/discovery/queries";
import { loadProfile } from "@web/entities/profile/queries";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";

function MatchCard({ match, accountId }: { match: Match; accountId: string }) {
  const session = useSession();
  const peerId = match.participantIds.find((id) => id !== accountId);
  // Match responses intentionally contain IDs only. Hydrate the existing public
  // profile endpoint, never an identity/account projection or simulated person.
  const profile = useQuery({
    queryKey: [accountId, "profile", peerId],
    enabled: !!peerId,
    queryFn: () => session.run((signal) => loadProfile(peerId, signal)),
  });
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-6">
      <span
        className="mb-5 flex size-14 items-center justify-center rounded-lg bg-muted text-xl font-bold"
        aria-hidden="true"
      >
        {profile.data?.displayName.slice(0, 1) || "А"}
      </span>
      <h2 className="text-lg font-bold">
        {profile.data?.displayName ||
          (profile.isPending ? "Загружаем профиль…" : "Совпадение")}
      </h2>
      {profile.error ? (
        <div className="mt-3">
          <ErrorPanel
            error={profile.error}
            retry={() => {
              void profile.refetch();
            }}
          />
        </div>
      ) : (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {profile.data?.bio || "Взаимный интерес — начало разговора."}
        </p>
      )}
      <p className="mb-5 mt-4 text-xs text-muted-foreground">
        Совпадение сохранено{" "}
        {new Date(match.createdAt).toLocaleDateString("ru-RU")}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        {peerId && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/people/${encodeURIComponent(peerId)}`}>Профиль</Link>
          </Button>
        )}
        <Button asChild size="sm">
          <Link to={`/messages/${encodeURIComponent(match.conversationId)}`}>
            Написать →
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function MatchesPage() {
  const session = useSession();
  const matches = useInfiniteQuery({
    queryKey: [session.me?.id, "matches"],
    queryFn: ({ pageParam }) =>
      session.run((signal) => loadMatches(pageParam, signal)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!session.me,
    retry: false,
    refetchOnMount: "always",
  });
  const items = [
    ...new Map(
      matches.data?.pages
        .flatMap((page) => page.items)
        .map((match) => [match.id, match]) ?? [],
    ).values(),
  ];
  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-xs tracking-wider text-muted-foreground">
            СОВПАДЕНИЯ
          </p>
          <h1 className="text-3xl font-bold">Интерес — взаимный.</h1>
          <p className="mt-3 text-muted-foreground">
            Здесь люди, с которыми вы выбрали друг друга. Самое время сказать
            привет.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={matches.isFetching}
          onClick={() => {
            void matches.refetch();
          }}
        >
          Обновить
        </Button>
      </header>
      {matches.isPending ? (
        <Loading />
      ) : matches.error && !items.length ? (
        <ErrorPanel
          error={matches.error}
          retry={() => {
            void matches.refetch();
          }}
        />
      ) : !items.length ? (
        <Empty title="Первое знакомство ещё впереди">
          <p>
            Совпадение появится, когда интерес будет взаимным. Один лайк не
            создаёт чат.
          </p>
          <Button asChild className="mt-5">
            <Link to="/discover">К людям</Link>
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              accountId={session.me?.id ?? ""}
            />
          ))}
        </div>
      )}
      {matches.error && items.length > 0 && (
        <div className="mt-5">
          <ErrorPanel
            error={matches.error}
            retry={() => {
              void matches.refetch();
            }}
          />
        </div>
      )}
      {matches.hasNextPage && (
        <div className="mt-7 text-center">
          <Button
            variant="outline"
            disabled={matches.isFetching}
            onClick={() => {
              void matches.fetchNextPage();
            }}
          >
            {matches.isFetchingNextPage ? "Загружаем…" : "Загрузить ещё"}
          </Button>
        </div>
      )}
    </>
  );
}

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { useRef } from "react";
import { useSession } from "@web/shared/lib/session-context";
import { api } from "@web/shared/api/client";
import { unwrap } from "@web/shared/api/errors";
import type { ApplicationPage } from "@web/entities/project/types";
import { SessionChanged } from "@web/shared/lib/session-scope";
import {
  catalogueKey,
  affectedProjectQuery,
  type CatalogueFilters,
} from "@web/entities/project/helpers";

export const projectApi = (projectId: string) =>
  api.api.v1.projects({ projectId });
export const applicationApi = (applicationId: string) =>
  api.api.v1.applications({ applicationId });
import { loadDictionaries } from "@web/entities/profile/queries";
export function useProjectDictionaries() {
  const { me, run } = useSession();
  return useQuery({
    queryKey: [me?.id, "projects", "dictionaries"],
    queryFn: ({ signal }) =>
      run((sessionSignal) =>
        loadDictionaries(AbortSignal.any([signal, sessionSignal])),
      ),
    staleTime: Infinity,
  });
}
export function useProject(projectId: string) {
  const { me, run } = useSession();
  return useQuery({
    queryKey: [me?.id, "projects", "detail", projectId],
    queryFn: ({ signal }) =>
      run((sessionSignal) =>
        unwrap(
          projectApi(projectId).get({
            fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
          }),
        ),
      ),
    enabled: !!projectId,
    refetchOnMount: "always",
  });
}
export function useProjectList(mine: boolean, filters: CatalogueFilters) {
  const { me, run } = useSession();
  return useInfiniteQuery({
    queryKey: mine
      ? [me?.id, "projects", "mine"]
      : catalogueKey(me?.id, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      run((sessionSignal) => {
        const options = {
          query: {
            ...(pageParam ? { cursor: pageParam } : {}),
            limit: 20,
            ...(!mine && filters.q ? { q: filters.q } : {}),
            ...(!mine && filters.goalId ? { goalId: filters.goalId } : {}),
          },
          fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
        };
        return unwrap(
          mine
            ? api.api.v1.me.projects.get(options)
            : api.api.v1.projects.get(options),
        );
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
}
export function useRoster(projectId: string) {
  const { me, run } = useSession();
  return useInfiniteQuery({
    queryKey: [me?.id, "projects", "roster", projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      run((sessionSignal) =>
        unwrap(
          projectApi(projectId).members.get({
            query: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
            fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
          }),
        ),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!projectId,
    refetchOnMount: "always",
  });
}
export function useApplications(projectId?: string, enabled = true) {
  const { me, run } = useSession();
  return useInfiniteQuery({
    queryKey: [me?.id, "applications", projectId ?? "mine"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      run((sessionSignal) => {
        const options = {
          query: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
          fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
        };
        return unwrap(
          projectId
            ? projectApi(projectId).applications.get(options)
            : api.api.v1.me.applications.get(options),
        );
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    refetchOnMount: "always",
  });
}

export function useProjectParticipation(projectId: string, owner: boolean) {
  const { me, run } = useSession();
  return useQuery({
    queryKey: [me?.id, "projects", "participation", projectId, owner],
    queryFn: ({ signal }) =>
      run(async (sessionSignal) => {
        const fetch = { signal: AbortSignal.any([signal, sessionSignal]) };
        let cursor: string | undefined;
        let member = owner;
        // The public roster is paginated. Absence from its first page is not proof
        // of nonmembership; use the authenticated current-membership collection.
        if (!member)
          do {
            const page = await unwrap(
              api.api.v1.me.projects.get({
                query: { limit: 50, ...(cursor ? { cursor } : {}) },
                fetch,
              }),
            );
            member = page.items.some((project) => project.id === projectId);
            cursor = page.nextCursor ?? undefined;
          } while (!member && cursor);
        if (member) return { member, pending: false };
        cursor = undefined;
        do {
          const page: ApplicationPage = await unwrap(
            api.api.v1.me.applications.get({
              query: { limit: 50, ...(cursor ? { cursor } : {}) },
              fetch,
            }),
          );
          if (
            page.items.some(
              (application) =>
                application.projectId === projectId &&
                application.state === "pending",
            )
          )
            return { member: false, pending: true };
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return { member: false, pending: false };
      }),
    enabled: !!projectId,
    refetchOnMount: "always",
  });
}
export function useProjectChat(projectId: string, enabled: boolean) {
  const { me, run } = useSession();
  return useQuery({
    queryKey: [me?.id, "conversations", "project", projectId],
    queryFn: ({ signal }) =>
      run(async (sessionSignal) => {
        let cursor: string | undefined;
        do {
          const page = await unwrap(
            api.api.v1.conversations.get({
              query: { limit: 50, ...(cursor ? { cursor } : {}) },
              fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
            }),
          );
          const conversation = page.items.find(
            (item) => item.projectId === projectId,
          );
          if (conversation) return conversation.id;
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return null;
      }),
    enabled,
    refetchOnMount: "always",
  });
}

export function useProjectAction() {
  const session = useSession();
  const client = useQueryClient();
  const lock = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: (operation: (signal: AbortSignal) => Promise<unknown>) =>
      session.run(async (signal) => {
        try {
          return await operation(signal);
        } finally {
          // Both conflicts and ambiguous transport failures need reconciliation.
          // Never refresh a new account from an old operation's completion.
          if (!signal.aborted)
            await client.invalidateQueries({
              predicate: (query) =>
                affectedProjectQuery(session.me?.id, query.queryKey),
            });
        }
      }),
  });
  const execute = async <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    saved?: (data: T) => void | Promise<void>,
  ) => {
    if (lock.current) return;
    lock.current = true;
    const signal = session.scope.signal;
    try {
      const result = (await mutation.mutateAsync(operation)) as T;
      if (!signal.aborted) await saved?.(result);
    } catch (error) {
      // Error stays in Query's mutation state; callers do not publish old data.
      if (error instanceof SessionChanged) mutation.reset();
    } finally {
      lock.current = false;
    }
  };
  return { ...mutation, execute };
}

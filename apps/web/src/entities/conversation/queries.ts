import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useSession } from "@web/shared/lib/session-context";
import { api } from "@web/shared/api/client";
import { ApiError, unwrap } from "@web/shared/api/errors";
import type { ConversationPage } from "@web/entities/conversation/types";
import { restartPages } from "@web/entities/conversation/reconcile";

export const threadApi = (conversationId: string) =>
  api.api.v1.conversations({ conversationId });
export const conversationKeys = {
  list: (accountId: string) => [accountId, "conversations", "list"] as const,
  detail: (accountId: string, id: string) =>
    [accountId, "conversations", "detail", id] as const,
  history: (accountId: string, id: string) =>
    [accountId, "messages", id] as const,
};
export const accessDenied = (error: unknown) =>
  error instanceof ApiError && [403, 404].includes(error.status);

export async function reconcileConversations(
  client: QueryClient,
  accountId: string,
  conversationId?: string,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return;
  const listKey = conversationKeys.list(accountId);
  // Activity moves rows between pages. Discard the old cursor chain before
  // refreshing, rather than appending a fresh page to a stale boundary.
  await client.cancelQueries({ queryKey: listKey });
  if (signal?.aborted) return;
  client.setQueryData<InfiniteData<ConversationPage, string | undefined>>(
    listKey,
    (data) => (data ? restartPages(data) : undefined),
  );
  await Promise.all([
    client.invalidateQueries({ queryKey: [accountId, "conversations"] }),
    client.invalidateQueries({
      queryKey: conversationId
        ? conversationKeys.history(accountId, conversationId)
        : [accountId, "messages"],
    }),
  ]);
}

export function useConversations() {
  const { me, run } = useSession();
  return useInfiniteQuery({
    queryKey: conversationKeys.list(me?.id ?? ""),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      run((sessionSignal) =>
        unwrap(
          api.api.v1.conversations.get({
            query: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
            fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
          }),
        ),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
    // The app coordinator owns focus/reconnect so it can restart list cursors.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
    retry: false,
  });
}
export function useConversation(conversationId: string, enabled = true) {
  const { me, run } = useSession();
  return useQuery({
    queryKey: conversationKeys.detail(me?.id ?? "", conversationId),
    queryFn: ({ signal }) =>
      run((sessionSignal) =>
        unwrap(
          threadApi(conversationId).get({
            fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
          }),
        ),
      ),
    enabled: !!me && !!conversationId && enabled,
    refetchOnMount: "always",
    retry: false,
  });
}
export function useMessages(conversationId: string, enabled: boolean) {
  const { me, run } = useSession();
  return useInfiniteQuery({
    queryKey: conversationKeys.history(me?.id ?? "", conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      run((sessionSignal) =>
        unwrap(
          threadApi(conversationId).messages.get({
            query: { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) },
            fetch: { signal: AbortSignal.any([signal, sessionSignal]) },
          }),
        ),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me && !!conversationId && enabled,
    refetchOnMount: "always",
    retry: false,
  });
}

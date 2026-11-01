import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@web/shared/lib/session-context";
import {
  accessDenied,
  reconcileConversations,
  threadApi,
} from "@web/entities/conversation/queries";
import type { SendAttempt } from "@web/entities/conversation/types";
import {
  getOutbox,
  newAttempt,
  retryAttempt,
  validateMessage,
} from "@web/features/messages/outbox";
import { unwrap } from "@web/shared/api/errors";
import { SessionChanged } from "@web/shared/lib/session-scope";
import { Button } from "@web/shared/ui/button";
import { Field, inputClass } from "@web/shared/ui/feedback";

export function useSendMessage(onDenied: () => void) {
  const { me, run, scope } = useSession();
  const client = useQueryClient();
  const box = getOutbox(scope);
  const generationSignal = scope.signal;
  const mutation = useMutation({
    retry: false,
    mutationFn: (attempt: SendAttempt) =>
      run((signal) =>
        unwrap(
          threadApi(attempt.conversationId).messages.post(
            { requestId: attempt.requestId, text: attempt.text },
            { fetch: { signal } },
          ),
        ),
      ),
  });
  const send = async (attempt: SendAttempt) => {
    if (!me || generationSignal.aborted) return;
    const existing = box
      .snapshot()
      .find(
        (item) =>
          item.requestId === attempt.requestId &&
          item.conversationId === attempt.conversationId,
      );
    if (existing?.status === "pending" || existing?.status === "saved") return;
    const signal = scope.signal;
    const pending = retryAttempt(attempt);
    box.put(pending);
    try {
      const message = await mutation.mutateAsync(pending);
      if (!signal.aborted) box.update(pending, { status: "saved", message });
    } catch (error) {
      if (signal.aborted || error instanceof SessionChanged) return;
      box.update(pending, { status: "failed", error });
      if (accessDenied(error)) onDenied();
    } finally {
      if (!signal.aborted) {
        // A failed response can still mean a committed message. HTTP history
        // resolves that ambiguity; do not manufacture another request ID.
        await reconcileConversations(
          client,
          me.id,
          attempt.conversationId,
          signal,
        );
      }
    }
  };
  return send;
}

export function Composer({
  conversationId,
  send,
}: {
  conversationId: string;
  send: (attempt: SendAttempt) => Promise<void>;
}) {
  const { me, scope } = useSession();
  const draftId = `message:${conversationId}`;
  const generationSignal = scope.signal;
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<{ text: string }>({
    defaultValues: { text: scope.draft(draftId) },
  });
  useEffect(() => {
    const subscription = watch((values) => {
      if (!generationSignal.aborted) scope.setDraft(draftId, values.text ?? "");
    });
    return () => subscription.unsubscribe();
  }, [scope, draftId, watch, generationSignal]);
  const submitLock = useRef(false);
  const submit = handleSubmit(({ text }) => {
    if (!me || generationSignal.aborted) return;
    const attempt = newAttempt(
      conversationId,
      me.id,
      text,
      crypto.randomUUID(),
    );
    // The immutable outbox owns submitted text. Clearing only the editor lets
    // people keep drafting; a failure retains its original text beside Retry.
    scope.setDraft(draftId, "");
    reset({ text: "" });
    void send(attempt).catch(() => undefined);
  });
  return (
    <form
      className="grid gap-3 border-t border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (submitLock.current) return;
        // Lock before RHF's asynchronous validation, not only inside its success
        // callback: two submits must not capture the same editor payload.
        submitLock.current = true;
        void submit(event)
          .finally(() => {
            submitLock.current = false;
          })
          .catch(() => undefined);
      }}
    >
      <Field label="Сообщение · до 4000 символов" error={errors.text?.message}>
        <textarea
          rows={3}
          className={`${inputClass} resize-y`}
          placeholder="Напишите сообщение…"
          {...register("text", { validate: validateMessage })}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Только текст. Черновик хранится до перезагрузки или выхода.
        </span>
        <Button type="submit">Отправить</Button>
      </div>
    </form>
  );
}

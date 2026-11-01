import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { useSession } from "@web/shared/lib/session-context";
import type { Dictionaries } from "@web/entities/profile/queries";
import {
  saveDecision,
  type DecisionResult,
  type Person,
} from "@web/entities/discovery/queries";
import { SessionChanged } from "@web/shared/lib/session-scope";
import { Button } from "@web/shared/ui/button";
import { ErrorPanel } from "@web/shared/ui/feedback";
import { DecisionGuard } from "./decision-guard";
import {
  exitDuration,
  exitTarget,
  SWIPE,
  swipeDecision,
  type Direction,
} from "./motion";

function PeopleCard({
  person,
  dictionaries,
  depth,
  x,
  width,
  reduced,
  busy,
  onStart,
  onEnd,
  onCancel,
}: {
  person: Person;
  dictionaries: Dictionaries;
  depth: number;
  x: MotionValue<number>;
  width: number;
  reduced: boolean;
  busy: boolean;
  onStart: () => void;
  onEnd: (info: PanInfo) => void;
  onCancel: () => void;
}) {
  const level = useMotionValue(depth),
    zero = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => level.set(depth), [depth, level]);
  const d = useTransform([x, level], ([offset, current]) =>
    reduced
      ? Number(current)
      : Math.max(
          0,
          Number(current) -
            Math.min(
              Math.abs(Number(offset)) / (width * SWIPE.distanceRatio),
              1,
            ),
        ),
  );
  const y = useTransform(d, (v) => v * SWIPE.depthY);
  const scale = useTransform(d, (v) => 1 - v * SWIPE.depthScale);
  const rotate = useTransform([x, d, level], ([offset, value, current]) =>
    reduced
      ? 0
      : Number(current) === 0
        ? Math.max(
            -SWIPE.maxTilt,
            Math.min(
              SWIPE.maxTilt,
              (Number(offset) / width) * SWIPE.maxTilt * 2,
            ),
          )
        : Number(value) * SWIPE.depthTilt,
  );
  const likeOpacity = useTransform(
    x,
    [12, width * SWIPE.distanceRatio],
    [0, 1],
  );
  const skipOpacity = useTransform(
    x,
    [-width * SWIPE.distanceRatio, -12],
    [1, 0],
  );
  const active = depth === 0;
  const specialization = dictionaries.specializations.find(
    (item) => item.id === person.specializationId,
  )?.label;
  const experience = dictionaries.experienceLevels.find(
    (item) => item.id === person.experienceId,
  )?.label;
  return (
    <motion.article
      className="discovery-card"
      data-active={active}
      aria-hidden={!active}
      inert={!active}
      style={{
        x: active ? x : zero,
        y,
        scale,
        rotate,
        zIndex: 10 - depth,
        pointerEvents: active ? "auto" : "none",
      }}
      drag={active && !busy ? "x" : false}
      dragMomentum={false}
      onDragStart={() => {
        setDragging(true);
        onStart();
      }}
      onDragEnd={(_, info) => {
        setDragging(false);
        onEnd(info);
      }}
      onPointerCancel={() => {
        setDragging(false);
        onCancel();
      }}
    >
      <div className="discovery-cover">
        <div className="discovery-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="discovery-cover-label">ЧЕЛОВЕК ДЛЯ ВАШЕЙ ИДЕИ</span>
        <span className="discovery-avatar" aria-hidden="true">
          {person.displayName.slice(0, 1)}
        </span>
      </div>
      <div className="discovery-card-body">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="rounded-full bg-muted px-3 py-1">
            {specialization}
          </span>
          <span className="text-muted-foreground">{experience}</span>
        </div>
        <h2 className="mt-4 text-2xl font-bold">{person.displayName}</h2>
        <p className="discovery-bio">
          {person.bio || "Познакомьтесь, чтобы узнать больше."}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {dictionaries.skills
            .filter((item) => person.skillIds.includes(item.id))
            .map((item) => (
              <span
                key={item.id}
                className="rounded-full border border-border px-2.5 py-1 text-xs"
              >
                {item.label}
              </span>
            ))}
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
            ИНТЕРЕСНО
          </span>
          <p className="mt-1 text-sm">
            {dictionaries.goals
              .filter((item) => person.goalIds.includes(item.id))
              .map((item) => item.label)
              .join(" · ")}
          </p>
        </div>
        <Link
          to={`/people/${encodeURIComponent(person.userId)}`}
          className="mt-4 inline-block text-sm font-semibold underline"
          tabIndex={active && !busy ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
        >
          Познакомиться ближе →
        </Link>
      </div>
      {active && dragging && (
        <>
          <motion.span
            className="discovery-stamp discovery-stamp-skip"
            style={{ opacity: skipOpacity }}
          >
            Пропустить
          </motion.span>
          <motion.span
            className="discovery-stamp discovery-stamp-like"
            style={{ opacity: likeOpacity }}
          >
            Нравится
          </motion.span>
        </>
      )}
    </motion.article>
  );
}

export function PeopleDeck({
  people,
  dictionaries,
  blocked,
  onBusy,
  onConfirmed,
}: {
  people: Person[];
  dictionaries: Dictionaries;
  blocked: boolean;
  onBusy: (busy: boolean) => void;
  onConfirmed: (person: Person, result: DecisionResult) => void;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [guard] = useState(() => new DecisionGuard());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [width, setWidth] = useState(400);
  const [announcement, setAnnouncement] = useState("");
  const deck = useRef<HTMLDivElement>(null);
  const alive = useRef(true),
    dragging = useRef(false),
    cancelled = useRef(false);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const finishExit = useRef<(() => void) | null>(null);
  const stopAnimation = () => {
    animation.current?.stop();
    // Motion may cancel unresolved keyframes without settling its thenable.
    // Explicitly release our waiter on interruption/unmount as well as finish.
    finishExit.current?.();
    finishExit.current = null;
  };
  const x = useMotionValue(0),
    fade = useMotionValue(1);
  const reduced = useReducedMotion() ?? false;
  const person = people[0];
  const mutation = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: Direction }) =>
      session.run((signal) =>
        saveDecision(id, direction === 1 ? "interested" : "skipped", signal),
      ),
    retry: false,
  });
  useEffect(() => {
    alive.current = true;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    if (deck.current) observer.observe(deck.current);
    return () => {
      alive.current = false;
      stopAnimation();
      observer.disconnect();
      onBusy(false);
    };
  }, []);
  useLayoutEffect(() => {
    stopAnimation();
    x.set(0);
    fade.set(1);
  }, [person?.userId, x, fade]);

  const home = () => {
    stopAnimation();
    if (reduced) x.set(0);
    else animation.current = animate(x, 0, SWIPE.returnSpring);
  };
  const decide = async (direction: Direction) => {
    if (!person || blocked) return;
    const token = guard.begin(person.userId);
    if (!token) return;
    // A ref-backed guard closes the same-render gesture/key/click race before
    // React's pending render. The next person waits for acknowledgement AND exit.
    setBusy(true);
    onBusy(true);
    setError(null);
    stopAnimation();
    const signal = session.scope.signal;
    try {
      await queryClient.cancelQueries({
        queryKey: [session.me?.id, "discovery"],
      });
      if (!alive.current || signal.aborted) return;
      const result = await mutation.mutateAsync({
        id: person.userId,
        direction,
      });
      if (!alive.current || signal.aborted) return;
      await new Promise<void>((resolve) => {
        finishExit.current = resolve;
        animation.current = reduced
          ? animate(fade, 0, {
              duration: SWIPE.reducedFadeSeconds,
              onComplete: resolve,
              onStop: resolve,
            })
          : animate(
              x,
              direction *
                Math.max(
                  exitTarget(window.innerWidth, width),
                  direction * x.get() + width / 2,
                ),
              {
                type: "tween",
                duration: exitDuration(x.get(), window.innerWidth, width),
                ease: SWIPE.exitEase,
                onComplete: resolve,
                onStop: resolve,
              },
            );
      });
      finishExit.current = null;
      if (!alive.current || signal.aborted) return;
      guard.settle(token, person.userId, true);
      setAnnouncement(
        `${person.displayName}: ${direction === 1 ? "интерес сохранён" : "пропущено"}`,
      );
      onConfirmed(person, result);
    } catch (failure) {
      if (!alive.current || signal.aborted || failure instanceof SessionChanged)
        return;
      guard.settle(token, person.userId, false);
      setError(failure);
      home();
    } finally {
      if (alive.current && !signal.aborted) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const decideRef = useRef(decide);
  useLayoutEffect(() => {
    decideRef.current = decide;
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]',
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      if (!event.repeat && !dragging.current)
        void decideRef.current(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <section
      className="discovery-deck-section"
      aria-label="Подборка людей"
      aria-busy={busy}
    >
      <p className="mb-4 font-mono text-[10px] tracking-wider text-muted-foreground">
        ВОЗМОЖНО, ВАМ ПО ПУТИ
      </p>
      <motion.div
        ref={deck}
        className="discovery-deck"
        style={{ opacity: fade }}
      >
        {people.slice(0, 3).map((candidate, depth) => (
          <PeopleCard
            key={candidate.userId}
            person={candidate}
            dictionaries={dictionaries}
            depth={depth}
            x={x}
            width={width}
            reduced={reduced}
            busy={busy || blocked}
            onStart={() => {
              stopAnimation();
              dragging.current = true;
              cancelled.current = false;
            }}
            onEnd={(info) => {
              dragging.current = false;
              if (busy || cancelled.current) return;
              const direction = swipeDecision(x.get(), info.velocity.x, width);
              if (direction) void decide(direction);
              else home();
            }}
            onCancel={() => {
              cancelled.current = true;
              dragging.current = false;
              if (!busy) home();
            }}
          />
        ))}
      </motion.div>
      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          disabled={busy || blocked || !person}
          onClick={() => {
            if (!dragging.current) void decide(-1);
          }}
        >
          ← Пропустить
        </Button>
        <Button
          disabled={busy || blocked || !person}
          onClick={() => {
            if (!dragging.current) void decide(1);
          }}
        >
          Нравится →
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {busy ? "Сохраняем решение…" : "Свайп, кнопки или ← → на клавиатуре"}
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {error !== null && (
        <div className="mt-5">
          <ErrorPanel error={error} />
          <p className="mt-2 text-sm text-muted-foreground">
            Решение не подтверждено. Карточка остаётся здесь: повторите действие
            кнопкой или обновите подборку, если ответ потерялся.
          </p>
        </div>
      )}
    </section>
  );
}

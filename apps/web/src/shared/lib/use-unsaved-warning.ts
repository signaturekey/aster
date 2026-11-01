import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedWarning(dirty: boolean) {
  const acknowledged = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !acknowledged.current &&
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Изменения не сохранены. Покинуть форму?"))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!acknowledged.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Successful saves may navigate before RHF's reset re-renders. Release this
  // specific form's guard synchronously, only after the server acknowledged it.
  return () => {
    acknowledged.current = true;
  };
}

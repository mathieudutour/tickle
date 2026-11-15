import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps just-completed reminders on screen for a moment, as Reminders does, so a mistaken tap can be undone where it
 * happened instead of from the Completed list.
 */
export function useLinger(ms = 1800) {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const linger = useCallback(
    (id: string) => {
      setIds((current) => new Set(current).add(id));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, ms);
      timers.current.add(timer);
    },
    [ms],
  );
  return [ids, linger] as const;
}

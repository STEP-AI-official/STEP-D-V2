"use client";

import { useCallback, useEffect, useState } from "react";

export interface SavedView<T> {
  name: string;
  filters: T;
}

/** Persist named filter presets to localStorage (plan §6 — 저장된 뷰). Generic over filter shape. */
export function useSavedViews<T>(storageKey: string) {
  const [views, setViews] = useState<SavedView<T>[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setViews(JSON.parse(raw) as SavedView<T>[]);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const write = useCallback(
    (updater: (prev: SavedView<T>[]) => SavedView<T>[]) => {
      setViews((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const save = useCallback(
    (name: string, filters: T) =>
      write((prev) => [...prev.filter((v) => v.name !== name), { name, filters }]),
    [write],
  );

  const remove = useCallback(
    (name: string) => write((prev) => prev.filter((v) => v.name !== name)),
    [write],
  );

  return { views, save, remove };
}

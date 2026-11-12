"use client";

import { useCallback, useState } from "react";

export type RequestStep = "idle" | "search" | "pick" | "form";
export type RequestDraft = { scheduled: boolean; time: string };
const emptyDraft: RequestDraft = { scheduled: false, time: "" };

/** Each Back consumes an entry; Close discards the entire unfinished flow. */
export function useRequestFlow() {
  const [path, setPath] = useState<Exclude<RequestStep, "idle">[]>([]);
  const [draft, setDraft] = useState<RequestDraft>(emptyDraft);
  const step: RequestStep = path.at(-1) ?? "idle";
  const start = useCallback(() => {
    setPath(["search"]);
    setDraft(emptyDraft);
  }, []);
  const go = useCallback((next: RequestStep) => {
    setPath((previous) =>
      next === "idle"
        ? []
        : previous.at(-1) === next
          ? previous
          : [...previous, next],
    );
    if (next === "idle") setDraft(emptyDraft);
  }, []);
  const back = useCallback(() => {
    setPath((previous) => previous.slice(0, -1));
  }, []);
  // Direct requests from a place/forecast enter at the form. Editing their
  // location still needs a picker, without appending another form/picker loop.
  const reselect = useCallback(() => {
    setPath((previous) => {
      const index = previous.lastIndexOf("pick");
      return index >= 0
        ? previous.slice(0, index + 1)
        : [...previous.slice(0, -1), "pick"];
    });
  }, []);
  return {
    step,
    previous: path.at(-2) ?? "idle",
    go,
    back,
    start,
    reselect,
    draft,
    setDraft,
  };
}

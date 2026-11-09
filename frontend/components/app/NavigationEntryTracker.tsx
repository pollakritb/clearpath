"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function NavigationEntryTracker() {
  const pathname = usePathname();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname !== location.pathname)
        pending.current = url.pathname;
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  useEffect(() => {
    if (pending.current === pathname) {
      window.history.replaceState(
        { ...window.history.state, cpInternalEntry: true },
        "",
      );
      pending.current = null;
    }
  }, [pathname]);
  return null;
}

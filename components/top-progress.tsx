"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "loading" | "done";

/**
 * Thin animated progress bar pinned to the top of the viewport. It starts on
 * any in-app link click (or browser back/forward) and completes when the route
 * actually changes — giving an immediate "something is happening" cue that
 * `loading.tsx` skeletons alone don't provide on first paint.
 */
function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  // Navigation start — link clicks and browser back/forward.
  useEffect(() => {
    function start() {
      if (safety.current) clearTimeout(safety.current);
      // Fail-safe: never leave the bar stuck if a navigation never resolves.
      safety.current = setTimeout(() => setPhase("done"), 12000);
      setPhase("loading");
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (only a hash / no real navigation) — ignore.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
    };
  }, []);

  // Navigation finished — the route (path or query) changed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (safety.current) clearTimeout(safety.current);
    setPhase((p) => (p === "loading" ? "done" : p));
  }, [pathname, searchParams]);

  // Reset after the completion animation has played.
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 500);
    return () => clearTimeout(t);
  }, [phase]);

  const style =
    phase === "loading"
      ? {
          width: "92%",
          opacity: 1,
          transition:
            "width 10s cubic-bezier(0.05, 0.7, 0.1, 1), opacity 0.1s ease",
        }
      : phase === "done"
        ? {
            width: "100%",
            opacity: 0,
            transition: "width 0.25s ease, opacity 0.4s ease 0.15s",
          }
        : { width: "0%", opacity: 0, transition: "none" };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] bg-accent shadow-[0_0_10px_1px] shadow-accent/60"
      style={style}
    />
  );
}

export function TopProgress() {
  // useSearchParams() must sit inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}

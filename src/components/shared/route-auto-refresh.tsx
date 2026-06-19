"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

type RouteAutoRefreshProps = {
  enabled?: boolean;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 10_000;

function canRefreshNow() {
  return (
    document.visibilityState === "visible" &&
    (typeof navigator === "undefined" || navigator.onLine)
  );
}

export function RouteAutoRefresh({
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS,
}: RouteAutoRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refresh = () => {
      if (!canRefreshNow()) {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    };

    const intervalId = window.setInterval(refresh, intervalMs);
    const refreshOnResume = () => {
      if (canRefreshNow()) {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("online", refreshOnResume);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
    };
  }, [enabled, intervalMs, router, startTransition]);

  return null;
}

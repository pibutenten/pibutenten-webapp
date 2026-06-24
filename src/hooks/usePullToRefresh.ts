"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 60;
const MAX_PULL = 120;

function dampen(raw: number): number {
  return MAX_PULL * (1 - Math.exp((-raw * 1.5) / MAX_PULL));
}

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const dist = useRef(0);
  const refreshingRef = useRef(false);
  const scrollAncestorRef = useRef<HTMLElement | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const findScrollAncestor = useCallback((): HTMLElement | null => {
    if (scrollAncestorRef.current) return scrollAncestorRef.current;
    let el = containerRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") {
        scrollAncestorRef.current = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  const getScrollTop = useCallback((): number => {
    const ancestor = findScrollAncestor();
    return ancestor ? ancestor.scrollTop : window.scrollY;
  }, [findScrollAncestor]);

  const applyTransform = useCallback((d: number, animate: boolean, isRefresh = false) => {
    const el = containerRef.current;
    const ind = indicatorRef.current;
    if (!el) return;
    const t = animate ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1)" : "none";
    el.style.transition = t;
    el.style.transform = d > 0 ? `translateY(${d}px)` : "";
    if (ind) {
      const progress = Math.min(d / THRESHOLD, 1);
      ind.style.transition = animate
        ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease"
        : "none";
      ind.style.opacity = String(Math.min(progress * 1.5, 1));
      if (isRefresh) {
        ind.style.transform = `translateX(-50%) translateY(${-d / 2 - 12}px)`;
      } else {
        ind.style.transform =
          `translateX(-50%) translateY(${-d / 2 - 12}px) rotate(${d * 4}deg) scale(${0.5 + progress * 0.5})`;
      }
    }
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshingRef.current) return;
    if (getScrollTop() > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
    dist.current = 0;
  }, [getScrollTop]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || refreshingRef.current) return;
    if (getScrollTop() > 0) {
      pulling.current = false;
      dist.current = 0;
      applyTransform(0, false);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      dist.current = 0;
      applyTransform(0, false);
      return;
    }
    dist.current = dampen(dy);
    applyTransform(dist.current, false);
  }, [getScrollTop, applyTransform]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    const d = dist.current;
    if (d >= THRESHOLD && !refreshingRef.current) {
      refreshingRef.current = true;
      setRefreshing(true);
      const refreshDist = THRESHOLD * 0.7;
      applyTransform(refreshDist, true, true);
      try { await onRefreshRef.current(); } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        dist.current = 0;
        applyTransform(0, true);
      }
    } else {
      dist.current = 0;
      applyTransform(0, true);
    }
  }, [applyTransform]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, indicatorRef, refreshing };
}

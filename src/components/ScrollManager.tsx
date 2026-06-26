"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "pbtt-scroll";

function getMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch { return {}; }
}
function savePos(path: string, y: number) {
  try {
    const m = getMap();
    m[path] = y;
    // Keep only last 30 entries to avoid bloating sessionStorage
    const keys = Object.keys(m);
    if (keys.length > 30) delete m[keys[0]];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* 인앱 브라우저(카톡/구글) sandbox·QuotaExceeded 시 storage 접근 차단 →
       스크롤 위치 저장만 degrade, 네비게이션은 정상 진행 (다른 storage 접근부와 동일 방어) */
  }
}

export default function ScrollManager() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const isPopState = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const onPopState = () => { isPopState.current = true; };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      // Save scroll position for the page we're leaving
      savePos(prevPath.current, window.scrollY);

      if (isPopState.current) {
        // Back/forward navigation — restore saved position
        const saved = getMap()[pathname];
        if (saved != null) {
          requestAnimationFrame(() => {
            window.scrollTo(0, saved);
          });
        }
      } else {
        // New navigation (link click) — scroll to top
        window.scrollTo(0, 0);
      }

      isPopState.current = false;
      prevPath.current = pathname;
    }
  }, [pathname]);

  return null;
}

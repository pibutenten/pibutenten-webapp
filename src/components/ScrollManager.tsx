"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markPopNavigation } from "@/lib/feed-scroll-restore";

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

    const onPopState = () => {
      isPopState.current = true;
      // R5-3: 피드 뒤로가기 복원 트리거 마크 — popstate 시점의 도착 URL 을 기록해
      //   FeedView 마운트가 "SPA back/forward 로 이 피드에 도착했는지" 판정하게 한다.
      //   (window 스크롤 복원은 앱 셸 내부 스크롤 구조상 무동작이라 피드 복원은 FeedView 가 담당.)
      markPopNavigation();
    };
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

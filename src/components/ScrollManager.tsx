"use client";

import { useEffect } from "react";

/**
 * F5/리로드 시 브라우저가 이전 스크롤 위치를 복원하지 않게 하고,
 * 항상 페이지 상단에서 시작하도록 강제.
 */
export default function ScrollManager() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    // 마운트 직후 한 번 더 보장
    window.scrollTo(0, 0);
  }, []);

  return null;
}

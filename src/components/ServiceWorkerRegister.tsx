"use client";

import { useEffect } from "react";

/**
 * 서비스워커(/sw.js) 등록 전용 컴포넌트.
 *
 * PWA 오프라인 캐시 + 웹푸시(PushNotificationToggle)의 토대다.
 * 과거에는 PWA 설치 안내 모달(InstallPrompt) 안에서 등록했으나, 네이티브 앱 출시 후
 * 설치 안내 모달을 제거(2026-06-24)하면서 SW 등록만 별도 컴포넌트로 분리한다.
 * (모달 삭제와 함께 SW 등록이 사라져 오프라인·웹푸시가 죽는 사고 방지.)
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 사용자 영향 없음 */
    });
  }, []);

  return null;
}

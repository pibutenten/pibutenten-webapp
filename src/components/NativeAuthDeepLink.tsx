"use client";

import { useEffect } from "react";
import { NATIVE_OAUTH_CALLBACK } from "@/lib/auth/oauth-providers";

/**
 * 네이티브(Capacitor) OAuth 딥링크 핸들러.
 *
 * 동작: 시스템 브라우저에서 OAuth 완료 후 custom scheme(`kr.pibutenten.app://auth/callback?...`)
 *   으로 앱에 복귀하면, 쿼리(code 또는 token_hash)를 웹뷰의 `/auth/callback` 으로 넘긴다.
 *   → 기존 서버 콜백 로직(코드 교환·verifyOtp·온보딩 분기·세션 쿠키 설정)을 그대로 재사용.
 *
 * 안전: @capacitor 모듈을 useEffect 안에서 **동적 import** → 서버(SSR)·웹 빌드에서 평가되지 않음.
 *   비네이티브(웹) 환경에서는 즉시 no-op.
 */
export default function NativeAuthDeepLink() {
  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import("@capacitor/app");
        const { Browser } = await import("@capacitor/browser");

        const handle = await App.addListener("appUrlOpen", async ({ url }) => {
          // OAuth 복귀 딥링크만 처리 — prefix 를 엄격히 고정(조작된 scheme/경로 차단).
          //   허용: 정확히 NATIVE_OAUTH_CALLBACK, 또는 그 뒤에 '?query' 가 붙은 형태만.
          if (
            !url ||
            !(url === NATIVE_OAUTH_CALLBACK || url.startsWith(`${NATIVE_OAUTH_CALLBACK}?`))
          ) {
            return;
          }
          const qIndex = url.indexOf("?");
          const query = qIndex >= 0 ? url.slice(qIndex) : "";
          // 시스템 브라우저 닫기(실패해도 무시) 후 웹뷰를 서버 콜백으로 이동.
          try {
            await Browser.close();
          } catch {
            /* 일부 플랫폼은 close 미지원 — 무시 */
          }
          // origin 은 웹뷰의 pibutenten.kr → 서버 /auth/callback 라우트 실행.
          //   PKCE verifier 쿠키(이 웹뷰)로 code 교환, 또는 token_hash verifyOtp.
          window.location.assign(`/auth/callback${query}`);
        });

        if (cancelled) {
          handle.remove();
          return;
        }
        removeListener = () => handle.remove();
      } catch {
        /* @capacitor 미존재(웹) 또는 로드 실패 — no-op */
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return null;
}

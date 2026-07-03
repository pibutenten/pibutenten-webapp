"use client";

/**
 * NativeLoginGate — 네이티브(Capacitor) 앱 전용 로그인 게이트 (2026-07-02, 원장 결정).
 *
 * 정책: 앱에서는 로그인해야 콘텐츠 열람 가능. 웹은 무변경(게스트 열람 + 점수 소프트월 —
 *   SEO·검색 유입용이라 웹까지 잠그지 않는다).
 *
 * 판정(오추방 방지 이중 확인 — 코드검수 반영):
 *   1) 로컬 auth 세션(supabase.auth.getSession, 네트워크 없음) 존재 → 통과.
 *   2) 없으면 서버 진실(/api/session) 확인 — SessionInfo(비-null) → 통과.
 *   3) 둘 다 아니면(진짜 비로그인) → /login?next={현재경로} 이동.
 *   ⚠ /api/session(getSessionInfo)은 "auth 유효 + profiles 행 미생성" 인 계정도 null 을
 *     반환하므로 서버 null 만으로 추방하면 그 계정이 로그인↔홈 왕복 루프에 빠질 수 있다 —
 *     1)의 로컬 auth 선확인이 그 케이스를 통과시킨다(fail-open).
 *   - 서버 오류(!ok)·네트워크 실패도 잠그지 않음(fail-open) — 게이트 오작동으로 로그인
 *     사용자까지 못 보게 되는 것이 게스트 일시 노출보다 나쁘다.
 *   - 웹/SSR 에서는 완전 no-op (@capacitor/core 동적 import — NativeAuthDeepLink 와 동일 패턴).
 *
 * 허용 경로(게이트 예외): 인증 흐름(/login·/signup·/auth)·온보딩·약관류(로그인/가입 화면에서
 *   여는 법적 고지). 그 외 전부 게이트.
 *
 * ⚠ App Store 심사: 로그인 필수 앱은 심사용 데모 계정 제출이 필요(App Review 정보 란) —
 *   docs/STORE_SUBMISSION_LOG.md 참조.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SessionInfo } from "@/lib/session-types";

const ALLOW_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/onboarding",
  "/terms",
  "/privacy",
  "/contact",
  "/disclaimer",
];

function isAllowed(pathname: string): boolean {
  return ALLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export default function NativeLoginGate() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return; // 웹 — no-op
        if (isAllowed(pathname ?? "/")) return;

        // 1) 로컬 auth 세션 — 있으면 로그인 확정, 게이트 통과.
        //    (OAuth 딥링크 복귀는 NativeAuthDeepLink 가 /auth/callback 으로 풀 내비게이션하므로
        //     게이트와의 실행 순서 경쟁 없음 — 콜백 처리 후 새 사이클에서 세션 확정.)
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session: localAuth },
        } = await supabase.auth.getSession();
        if (localAuth) return;

        // 2) 서버 진실 확인 — 쿠키 desync(12h 만료·WKWebView 동기 지연)로 로컬이 못 읽어도
        //    서버가 세션을 보면 통과(로그인 사용자 오추방 방지).
        //    잔류 케이스(검수 명시): 만료 토큰의 refresh 네트워크 실패(1도 null) + 쿠키 desync
        //    (2도 null)가 동시면 로그인 사용자도 추방될 수 있으나, /login 이 세션 감지 시 즉시
        //    복귀시키므로 1회성 왕복에 그침(둘 다 실패 = 사실상 오프라인 수준의 순단).
        const r = await fetch("/api/session", { credentials: "same-origin" });
        if (!r.ok) return; // fail-open
        const info = (await r.json()) as SessionInfo; // SessionInfo | null
        if (cancelled) return;
        // null/undefined(비정상 응답 포함)만 비로그인 판정 — 정상 SessionInfo 객체는 통과.
        if (info == null) {
          const next =
            window.location.pathname +
            window.location.search +
            window.location.hash;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } catch {
        /* @capacitor 미존재(웹)·로드 실패 — no-op */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

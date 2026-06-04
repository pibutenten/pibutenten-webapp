"use client";

import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 로그아웃 시 브라우저에서 명시 삭제할 클라이언트 가시 쿠키 (2026-05-28).
 *
 *   - pibutenten:identity-mirror : active identity UI 표시용 (httpOnly: false). 남으면
 *                                  다음 사용자가 로그인하기 전까지 옛 active 신분이 노출.
 *   - pibutenten_onboarded       : middleware fast-path 캐시. 남으면 다른 OAuth 계정으로
 *                                  로그인할 때 onboarding 게이트가 우회될 가능성.
 *
 * httpOnly 쿠키 (pibutenten:identity, auth session 등) 는 supabase.auth.signOut() 가
 * 서버 측에서 처리한다. 본 코드는 클라이언트에서만 보이는 쿠키만 다룬다.
 */
const CLIENT_VISIBLE_COOKIES_TO_CLEAR = [
  "pibutenten:identity-mirror",
  "pibutenten_onboarded",
] as const;

function deleteClientCookie(name: string) {
  // path=/ + Max-Age=0 으로 즉시 만료. host-only 쿠키(Domain= 미지정)라 어느 도메인에서나 동일 동작.
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export default function LogoutButton({
  redirectTo = "/",
  label = "로그아웃",
  className,
}: {
  /** 로그아웃 후 이동 경로. 기본 "/". 온보딩 trap 탈출 시 "/login" 사용. */
  redirectTo?: string;
  /** 버튼 라벨(기본 "로그아웃"). */
  label?: string;
  /** 클래스 오버라이드(미지정 시 기본 텍스트 버튼 스타일). */
  className?: string;
} = {}) {
  const [pending, start] = useTransition();
  function onClick() {
    if (pending) return;
    start(async () => {
      const sb = createSupabaseBrowserClient();
      await sb.auth.signOut();
      // signOut 후에도 비-httpOnly 쿠키는 그대로 남으므로 명시 삭제.
      for (const name of CLIENT_VISIBLE_COOKIES_TO_CLEAR) {
        deleteClientCookie(name);
      }
      // 첫 가입 강제 게이트 쿠키도 만료 — 로그아웃 후 /login 에서 갇히지 않게.
      deleteClientCookie("pibutenten_must_onboard");
      window.location.assign(redirectTo);
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        className ??
        "text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] hover:underline disabled:opacity-50"
      }
    >
      {pending ? "처리 중…" : label}
    </button>
  );
}

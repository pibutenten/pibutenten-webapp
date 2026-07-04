"use client";

/**
 * SessionContext — 클라이언트 컴포넌트에 active session 정보를 전달.
 *
 * V-Phase(2026-06-07): layout 이 서버에서 세션을 읽지 않도록 전환.
 *   - 동기 최소 판단: 마운트 즉시 비-httpOnly 쿠키(onboarded/identity-mirror, UI 표시 전용)로
 *     active profile id 를 잠정 결정한다(네트워크 없음). 쿠키가 있으면 me 가 즉시 채워져
 *     좋아요/저장 클릭 동작이 정확하다(race window 없음).
 *   - 비동기 서버 확인(2026-07-02): 쿠키 유무와 **무관하게** /api/session 을 항상 1회 조회해
 *     서버 진실로 보정한다 — 쿠키 부재 = 로그아웃 "확정"이 아니라 "잠정". (onboarded 12h 만료·
 *     앱 WebView 쿠키 동기 지연으로 실세션과 어긋나던 "로그인 페이지 튕김" 수정.)
 *     진짜 게스트는 200+null → me=null 유지 → LoginPromptDialog 동작 기존과 동일.
 *   - 비동기 리치: role/displayName/avatar/handle/doctorSlug/identities 도 같은 응답으로 보강.
 *
 * ⚠ 보안(ADR 0005): 위 쿠키는 클라 UX 표시 전용이며 인가에 절대 쓰지 않는다. 실제 권한은
 *   서버가 RLS + auth.getUser() 로 재검증하므로 쿠키 위조는 서버에서 거부된다.
 *
 * SessionInfo 타입은 lib/session-types 에서 정의(중립 모듈, 런타임 순환 없음).
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SessionInfo } from "@/lib/session-types";
import { IDENTITY_MIRROR_COOKIE, UUID_RE } from "@/lib/identity-shared";

const SessionContext = createContext<SessionInfo>(null);

/** 미들웨어가 로그인+온보딩 사용자에 매 요청 set 하는 비-httpOnly 쿠키(= active profile.id). */
const ONBOARDED_COOKIE = "pibutenten_onboarded";

/** 비-httpOnly 쿠키에서 active profile id 동기 추출(클라 전용). 없으면 null = 로그아웃. */
function readActiveIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const read = (name: string): string | null => {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  // 전환 직후 최신값은 mirror, 평상시 로그인 신호는 onboarded.
  const mirror = read(IDENTITY_MIRROR_COOKIE);
  if (mirror && UUID_RE.test(mirror)) return mirror;
  const onboarded = read(ONBOARDED_COOKIE);
  if (onboarded && UUID_RE.test(onboarded)) return onboarded;
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // SSR/첫 렌더는 null(쿠키 접근 불가) → 하이드레이션 mismatch 없음.
  const [session, setSession] = useState<SessionInfo>(null);

  // hydration-safe: 마운트 후에만 쿠키/네트워크 접근. 동기 쿠키로 me 즉시 확정.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const id = readActiveIdFromCookie();
    if (id) {
      // 1) 동기 최소 세션 즉시(네트워크 없음) — me 비-null 확정 → 클릭 동작 정확.
      setSession({
        role: "user",
        displayName: "",
        avatarUrl: null,
        handle: null,
        doctorSlug: null,
        doctorId: null,
        identities: [],
        activeIdentityId: id,
      });
    }
    // 2) 비동기 리치 보강 — role/avatar/identities 등. ★쿠키 유무와 무관하게 항상 조회.
    //    (2026-07-02 수정) 구 코드는 쿠키 부재 시 서버 확인 없이 '비로그인 확정'으로 조기
    //    return 했다 — onboarded 쿠키(12h 만료)·mirror 쿠키가 실제 auth 세션(장수명)보다
    //    먼저 사라지거나 앱 WebView(iOS WKWebView 등)가 document.cookie 동기화를 지연하면,
    //    실제 로그인 상태인데 헤더가 '로그인'으로 표시되고 → 로그인 탭 → /login 서버가
    //    세션 감지 → 즉시 원복하는 "로그인 페이지 튕김"이 됐다(원장 제보). 서버 진실을
    //    항상 1회 확인해 desync 를 자가 치유한다(진짜 게스트는 200+null → null 유지).
    //    ★서버 진실 반영(가드 수정 2026-06-07):
    //      - 200 + SessionInfo(로그인) → 리치 세션 반영(아바타·명함 등).
    //      - 200 + null(로그아웃 확정 — 묵은 onboarded/mirror 쿠키였던 경우) → 세션 제거
    //        → AppShell 헤더가 아바타 대신 '로그인' 링크 노출(회귀 복구). (옛 TopNav 폐기 2026-06-27)
    //      - !ok(500 등 서버 오류) → undefined → 현 상태 유지(거짓 로그아웃 방지).
    let alive = true;
    fetch("/api/session", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : undefined))
      .then((full) => {
        // 게스트(null→null) setState 는 React 가 동일 값 bailout 으로 스킵 — 추가 렌더 없음.
        if (alive && full !== undefined) setSession(full);
      })
      .catch(() => {
        /* 네트워크 오류 — 현 상태 유지(거짓 로그아웃 방지) */
      });
    return () => {
      alive = false;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * 클라이언트에서 즉시 사용 가능한 active session.
 * - 로그아웃 → null (마운트 즉시)
 * - 로그인 → SessionInfo (마운트 직후 쿠키로 최소값, 곧 /api/session 으로 리치 보강)
 */
export function useSession(): SessionInfo {
  return useContext(SessionContext);
}

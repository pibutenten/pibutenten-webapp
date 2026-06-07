"use client";

/**
 * SessionContext — 클라이언트 컴포넌트에 active session 정보를 전달.
 *
 * V-Phase(2026-06-07): layout 이 서버에서 세션을 읽지 않도록 전환.
 *   - 동기 최소 판단: 마운트 즉시 비-httpOnly 쿠키(onboarded/identity-mirror, UI 표시 전용)로
 *     로그인 여부 + active profile id 를 결정한다(네트워크 없음). 로그아웃 = 쿠키 없음 = me=null
 *     즉시 → 좋아요/저장 클릭 시 LoginPromptDialog 즉시 노출(2026-05-20 회귀 그대로 유지).
 *     로그인 사용자는 마운트 직후(첫 effect, 네트워크 없음) me 가 채워져 실사용상 race window 없음.
 *   - 비동기 리치: role/displayName/avatar/handle/doctorSlug/identities 는 /api/session 으로 보강.
 *
 * ⚠ 보안(ADR 0005): 위 쿠키는 클라 UX 표시 전용이며 인가에 절대 쓰지 않는다. 실제 권한은
 *   서버가 RLS + auth.getUser() 로 재검증하므로 쿠키 위조는 서버에서 거부된다.
 *
 * SessionInfo 타입은 TopNav 에서 정의(타입만 import — 런타임 순환 없음).
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SessionInfo } from "@/components/TopNav";
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
    if (!id) {
      // 로그아웃 — me=null 유지(이미 null). 리치 fetch 불필요.
      return;
    }
    // 1) 동기 최소 세션 즉시(네트워크 없음) — me 비-null 확정 → 클릭 동작 정확.
    setSession({
      role: "user",
      displayName: "",
      avatarUrl: null,
      handle: null,
      doctorSlug: null,
      identities: [],
      activeIdentityId: id,
    });
    // 2) 비동기 리치 보강 — role/avatar/identities 등.
    let alive = true;
    fetch("/api/session", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((full: SessionInfo) => {
        if (alive && full) setSession(full);
      })
      .catch(() => {
        /* 보강 실패해도 최소 세션 유지 */
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

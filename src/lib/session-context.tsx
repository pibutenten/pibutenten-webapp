"use client";

/**
 * SessionContext — SSR 에서 결정된 session 정보를 클라이언트 컴포넌트에 즉시 전달.
 *
 * 도입 배경 (2026-05-20):
 *   useCardViewer 의 `me` 결정이 클라이언트에서 `auth.getUser()` 비동기 호출에 의존
 *   → 카드 mount 직후 100~300ms 동안 `me === undefined` → 비로그인 사용자가
 *   좋아요/저장 클릭해도 silent return → LoginPromptDialog 가 안 뜨던 회귀.
 *
 * 새 정책:
 *   layout.tsx 가 server 에서 결정한 SessionInfo 를 Context 로 즉시 노출.
 *   클라이언트 컴포넌트는 useSession() 으로 즉시 로그인 여부 판단.
 *   비로그인 → me = null 즉시 → 클릭 즉시 모달 노출.
 *
 * SessionInfo 자체는 TopNav 에서 기존 정의 재사용 (TopNav 의존 시 순환 방지를 위해
 * 타입만 동일 구조로 별도 export).
 */

import { createContext, useContext, type ReactNode } from "react";
import type { SessionInfo } from "@/components/TopNav";

const SessionContext = createContext<SessionInfo>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionInfo;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * SSR 에서 결정된 session 정보를 즉시 반환.
 * - 비로그인 → null
 * - 로그인 → SessionInfo 객체
 *
 * 호출처가 hydration 직후 즉시 사용 가능 (await/async 없음).
 */
export function useSession(): SessionInfo {
  return useContext(SessionContext);
}

"use client";

/**
 * WriteFab — 모바일 우하단 글쓰기 FAB(Floating Action Button).
 *
 * 하단 5탭에서 '글쓰기'를 분리(투데이/내 노트/피드/쇼핑/마이)하면서, 글쓰기 진입을
 * 우하단 떠 있는 버튼으로 제공한다. 누르면 /write(시술노트/시술후기/끄적끄적 탭)로 이동.
 *
 * 단일 배선: layout 에 한 번만 렌더하고 경로로 노출을 제어한다.
 *   - AppShell 은 z-index:100 풀뷰포트 오버레이라, FAB 는 그 위(z-[110])에 떠야 보인다.
 *   - 모바일 전용(sm:hidden) — 데스크탑은 헤더 우측 '글쓰기' 버튼이 담당.
 *   - 하단 탭바 위(약 76px + safe-area)로 띄워 탭과 겹치지 않게 한다.
 *
 * 숨기는 경로: 글쓰기/후기 작성 흐름, 인증·온보딩, 하단탭이 없는 관리자·원장 대시보드.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

// 글쓰기 진입이 어색하거나 하단 탭바가 없는 화면에서는 FAB 를 숨긴다.
//   규칙: p === pre || p.startsWith(pre + "/") → '/doctor' 는 숨기되 '/doctors'(목록)는 유지.
const HIDE_PREFIXES = [
  "/write", // 글쓰기 본화면·수정
  "/review", // 후기 작성·수정
  "/login",
  "/signup",
  "/onboarding",
  "/auth",
  "/u", // OAuth 후 리다이렉트 경유
  "/admin", // 관리자(wide 셸 — 하단탭 없음)
  "/doctor", // 원장 대시보드(wide 셸) — '/doctors' 목록은 제외됨
  "/app", // 앱 다운로드 랜딩(풀스크린 오버레이) — 글쓰기 맥락 없음, FAB 숨김
];

function isHidden(pathname: string): boolean {
  return HIDE_PREFIXES.some((pre) => pathname === pre || pathname.startsWith(pre + "/"));
}

export default function WriteFab() {
  const pathname = usePathname();
  if (isHidden(pathname)) return null;

  return (
    <Link
      href="/write"
      aria-label="글쓰기"
      title="글쓰기"
      className="fixed right-[18px] z-[110] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(34,43,53,0.28)] transition-transform active:scale-95 sm:hidden"
      style={{
        bottom: "calc(76px + env(safe-area-inset-bottom))",
        background: "#4cbff2",
      }}
    >
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </Link>
  );
}

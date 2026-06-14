"use client";

/**
 * GlobalChrome — 루트 레이아웃의 전역 크롬(TopNav/SiteFooter)을 경로별로 분기 렌더.
 *
 * 베타 스킨으로 "승격된" 라우트는 자체 셸(BetaSkinShell, fixed 오버레이)이 헤더·탭바·캔버스를
 * 담당한다. 그런 라우트에서 루트의 옛 TopNav/SiteFooter 를 함께 렌더하면, 첫 로딩에 옛 헤더가
 * 잠깐 보였다가 오버레이가 덮는 "깜빡임"이 생긴다. → 승격 라우트에선 옛 크롬을 아예 렌더하지
 * 않아(덮는 게 아니라 처음부터 베타만) 한 번에 가볍게 뜨도록 한다.
 *
 * usePathname 은 SSR/CSR 동일 값이라 서버 렌더 HTML 부터 옛 크롬이 빠진다(하이드레이션 안전).
 *
 * 전환 진행 규칙: 화면을 베타로 승격할 때마다 아래 목록에 그 경로를 추가한다.
 * 전 화면 승격 완료(공개 전환) 시점에는 TopNav/SiteFooter 자체를 폐기하고 이 분기를 제거한다.
 */

import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";

/** 정확 일치로 승격된 라우트(자체 베타 셸 보유). 하위경로(/record/[id] 등)는 아직 미승격이라 제외. */
const BETA_PROMOTED_EXACT = new Set<string>([
  "/", // 홈 피드 (Phase 1)
  "/record", // 내 노트 (Phase 1b)
  "/write", // 글쓰기 (Phase 1b)
  "/doctor", // 원장 대시보드 (Phase 3, 관리자 방식 셸)
]);

function isBetaPromoted(pathname: string | null): boolean {
  if (!pathname) return false;
  return BETA_PROMOTED_EXACT.has(pathname);
}

export function ChromeHeader() {
  const pathname = usePathname();
  if (isBetaPromoted(pathname)) return null;
  return <TopNav />;
}

export function ChromeFooter() {
  const pathname = usePathname();
  if (isBetaPromoted(pathname)) return null;
  return <SiteFooter />;
}

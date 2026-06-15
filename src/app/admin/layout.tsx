import type { Metadata } from "next";

/**
 * 관리자 영역 전용 레이아웃.
 *  - 모든 /admin/* 경로 noindex (검색·AI 색인 차단)
 *
 * AdminBackLink 제거(2026-06-15): /admin 대시보드가 베타 셸(BetaSkinShell)을 쓰면서
 * 셸이 z-100 풀스크린 오버레이로 글로벌 크롬을 덮는다. 각 페이지가 자체 셸/BackButton 으로
 * back 을 제공하므로 레이아웃의 백 링크는 가려지고 중복이라 삭제.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}

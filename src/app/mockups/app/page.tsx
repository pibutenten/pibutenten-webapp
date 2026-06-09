import type { Metadata } from "next";
import AppShellMockup from "./AppShellMockup";

/**
 * 피부텐텐 앱/웹 통합 정보구조(IA) — 검토용 셸 목업 (시스템 미반영, mock 데이터).
 * 상단 토글로 모바일/앱(하단 5탭)·데스크탑 웹(상단 내비)을 모두 미리 본다.
 * noindex — URL 아는 사람만 검토.
 */
export const metadata: Metadata = {
  title: "앱/웹 통합 구조 목업 (검토용)",
  robots: { index: false, follow: false },
};

export default function AppShellMockupPage() {
  return <AppShellMockup />;
}

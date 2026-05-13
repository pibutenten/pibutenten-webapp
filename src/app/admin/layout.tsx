import type { Metadata } from "next";
import AdminBackLink from "./AdminBackLink";

/**
 * 관리자 영역 전용 레이아웃.
 *  - 모든 /admin/* 경로 noindex (검색·AI 색인 차단)
 *  - 하위 페이지 좌상단에 "← 대시보드" 백 링크 (대시보드 /admin은 제외)
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AdminBackLink />
      {children}
    </>
  );
}

import type { Metadata } from "next";

/**
 * 관리자 영역 전용 레이아웃.
 *  - 모든 /admin/* 경로 noindex (검색·AI 색인 차단)
 *  - root layout main의 max-w-1080은 그대로 유지
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}

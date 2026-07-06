import type { Metadata } from "next";

/**
 * 병원 운영 페이지 전용 레이아웃 — 모든 /clinic/* 경로 noindex(검색·AI 색인 차단).
 * (관리자 admin/layout.tsx 와 동일 패턴.)
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ClinicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}

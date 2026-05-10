import type { Metadata } from "next";

/** /me 본인 대시보드 영역 — 모두 noindex (개인정보·세션 보호) */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function MeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}

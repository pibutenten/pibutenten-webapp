import type { Metadata } from "next";

/**
 * 회원 프로필 영역(/u/*) — UGC noindex.
 *  - 검증되지 않은 일반인 의견이 의료 정보로 색인되지 않게 (YMYL 안전성)
 *  - robots.txt에서도 Disallow 처리됨
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true }, // 링크 추적은 허용 (다른 페이지로의 신호 보존)
};

export default function UserProfileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}

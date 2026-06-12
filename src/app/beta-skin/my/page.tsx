import type { Metadata } from "next";
import MyView from "./MyView";

/**
 * /beta-skin/my — 신규 스킨 "마이" 프리뷰 (my.html 컨셉).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터: 전부 샘플(프로필·통계·메뉴·사이드 모두 예시 — 로그인 필요 데이터).
 */
export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 마이",
  robots: { index: false, follow: false },
};

export default function BetaSkinMyPage() {
  return <MyView />;
}

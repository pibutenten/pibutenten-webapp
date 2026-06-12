import type { Metadata } from "next";
import WriteView from "./WriteView";

/**
 * /beta-skin/write — 신규 스킨 "글쓰기" 프리뷰 (write.html 컨셉).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터: 없음 — 디자인 UI 전용(제출 동작 없음, 폼 상태는 로컬 useState).
 */
export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 글쓰기",
  robots: { index: false, follow: false },
};

export default function BetaSkinWritePage() {
  return <WriteView />;
}

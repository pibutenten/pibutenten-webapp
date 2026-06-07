import type { Metadata } from "next";
import SkinDiaryMockup from "./SkinDiaryMockup";

/**
 * 피부일기 통합 — 검토용 디자인 목업 (시스템 미반영).
 *
 * 실제 앱 라우트로 두어 layout.tsx 의 TopNav / SiteFooter / 1080px 컨테이너 /
 * 디자인 토큰 / 반응형(데스크탑·모바일)이 100% 동일하게 적용된다.
 * noindex — URL 아는 사람만 검토.
 *
 * 계획서: docs/plans/skin-diary-integration-plan.md
 */
export const metadata: Metadata = {
  title: "피부일기 목업 (검토용)",
  robots: { index: false, follow: false },
};

export default function SkinDiaryMockupPage() {
  return <SkinDiaryMockup />;
}

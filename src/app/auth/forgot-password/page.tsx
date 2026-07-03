import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 재설정",
  robots: { index: false, follow: false },
};

/**
 * /auth/forgot-password — 비밀번호 재설정 메일 요청 (Phase 2, 2026-07-03).
 *
 * 로그인 여부 무관 접근 허용 — 기존 운영 계정(원장님들)도 비밀번호를 잊었을 때
 * 비로그인 상태로 사용한다. 가드·분기 없음, 본문은 클라 폼이 전담.
 */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

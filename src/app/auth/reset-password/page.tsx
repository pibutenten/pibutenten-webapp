import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "새 비밀번호 설정",
  robots: { index: false, follow: false },
};

/**
 * /auth/reset-password — 새 비밀번호 설정 (Phase 2, 2026-07-03).
 *
 * 재설정 메일 링크 → /auth/callback?type=recovery → verifyOtp 로 세션 확립 후
 * 이 페이지로 리다이렉트된다. 세션 검사는 클라 폼이 getSession() 으로 수행
 * (recovery 세션은 클라 쿠키 기준이 확실 — 서버 가드로 튕기면 정상 흐름도 깨질 수 있음).
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}

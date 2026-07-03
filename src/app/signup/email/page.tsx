import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignupEmailForm from "./SignupEmailForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "이메일로 가입",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * /signup/email — 이메일 회원가입 (Phase 2, 2026-07-03).
 *
 *  - 이미 로그인 → next 또는 홈으로 (가입 페이지 재진입 불필요)
 *  - next 는 sanitize 없이 폼으로 전달 — 확인 메일 클릭 후 /auth/callback 의
 *    sanitizeNext 가 최종 검증한다(open redirect 방어는 콜백 책임).
 *  - 상위 signup/layout.tsx 는 robots noindex 만 제공(시각 셸 없음) —
 *    본문 셸(AppShell)은 SignupEmailForm 이 LoginView 선례대로 자체 구성.
 */
export default async function SignupEmailPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // open redirect 방어(검수 반영) — 같은 사이트 상대경로만 허용(// 프로토콜 상대 차단).
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    redirect(safeNext);
  }

  return <SignupEmailForm next={next} />;
}

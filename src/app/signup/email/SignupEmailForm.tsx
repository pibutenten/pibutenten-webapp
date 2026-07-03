"use client";

/**
 * SignupEmailForm — /signup/email 이메일 회원가입 본문 (클라이언트, Phase 2 2026-07-03).
 *
 * 흐름: 이메일·비밀번호(8자+)·확인 입력 → supabase.auth.signUp(emailRedirectTo=/auth/callback)
 *   → "확인 메일을 보냈어요" 안내. 메일 링크 클릭 시 기존 /auth/callback 의
 *   verifyOtp(type=signup) 분기가 세션 발급 → 약관 게이트(/signup) → 온보딩으로 이어진다.
 *
 * 이미 가입된 이메일: Supabase 는 보안상(계정 존재 노출 방지) 성공 모양으로 응답하되
 *   data.user.identities 가 빈 배열 — 이 경우 로그인/비밀번호 재설정 안내로 분기.
 *
 * 셸: LoginView 선례 — 상단바만 앱 셸(wide, 탭바 숨김), 본문은 카드 톤 유지.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toKoreanError } from "@/lib/supabase-errors";
import { SITE_URL } from "@/lib/site";

type Phase = "form" | "sent" | "already";

const INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none caret-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25";

/** rate limit 계열은 원문이 다양해 포함 검사로 통일 안내. */
function mapSignupError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("for security purposes")) {
    return "요청이 많아요 — 잠시 후 다시 시도해 주세요";
  }
  return toKoreanError(msg) || "가입 요청에 실패했어요";
}

export default function SignupEmailForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [isPending, startTransition] = useTransition();

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 해요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("두 비밀번호가 일치하지 않아요. 다시 확인해 주세요.");
      return;
    }
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // SITE_URL(SSOT) — window.location.origin 이면 preview 배포에서 메일 링크가
          //   preview 도메인으로 발송되는 문제(검수 반영). 메일 링크는 항상 canonical.
          emailRedirectTo:
            SITE_URL +
            "/auth/callback" +
            (next ? "?next=" + encodeURIComponent(next) : ""),
        },
      });
      if (signUpErr) {
        setError(mapSignupError(signUpErr.message));
        return;
      }
      // 이미 가입된 이메일 — Supabase 는 성공 모양 + identities 빈 배열로 응답.
      if (data.user?.identities?.length === 0) {
        setPhase("already");
        return;
      }
      setPhase("sent");
    });
  }

  return (
    <AppShell active="마이" wide keepCanvas>
      <section className="mx-auto w-full max-w-[400px] py-10">
        {phase === "sent" ? (
          <>
            <h1 className="mb-6 text-center text-xl font-bold text-[var(--text)]">
              확인 메일을 보냈어요
            </h1>
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {email.trim()} 의 받은편지함(스팸함 포함)을 확인하고, 메일의
                버튼을 누르면 가입이 이어져요.
              </p>
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                메일이 안 왔다면 몇 분 뒤 다시 시도해 주세요.
              </p>
            </div>
            <p className="mt-5 text-center text-[12.5px] text-[var(--text-secondary)]">
              <Link href={loginHref} className="hover:text-[var(--primary)] hover:underline">
                로그인 화면으로 돌아가기
              </Link>
            </p>
          </>
        ) : phase === "already" ? (
          <>
            <h1 className="mb-6 text-center text-xl font-bold text-[var(--text)]">
              이미 가입된 이메일이에요
            </h1>
            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                소셜 계정으로 가입하셨을 수 있어요 — 로그인하거나 비밀번호
                재설정을 이용해 주세요.
              </p>
            </div>
            <p className="mt-5 text-center text-[12.5px] text-[var(--text-secondary)]">
              <Link href={loginHref} className="hover:text-[var(--primary)] hover:underline">
                로그인하기
              </Link>
              <span className="mx-2 text-[var(--text-muted)]">·</span>
              <Link
                href="/auth/forgot-password"
                className="hover:text-[var(--primary)] hover:underline"
              >
                비밀번호 재설정
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1.5 text-center text-xl font-bold text-[var(--text)]">
              이메일로 가입하기
            </h1>
            <p className="mb-6 text-center text-[13px] text-[var(--text-muted)]">
              확인 메일의 버튼을 누르면 가입이 이어져요
            </p>
            <form
              onSubmit={handleSubmit}
              className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
            >
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-secondary)]">이메일</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="example@email.com"
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-secondary)]">
                  비밀번호 (8자 이상)
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-secondary)]">
                  비밀번호 확인
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className={INPUT_CLASS}
                  autoComplete="new-password"
                />
              </label>
              {error && (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={isPending}
                className="mt-2 w-full rounded-md bg-[var(--primary)] py-2 font-semibold text-white transition-opacity disabled:opacity-60"
              >
                {isPending ? "확인 메일 보내는 중…" : "확인 메일 받기"}
              </button>
            </form>
            <p className="mt-5 text-center text-[12.5px] text-[var(--text-secondary)]">
              이미 계정이 있으세요?{" "}
              <Link
                href={loginHref}
                className="font-semibold text-[var(--primary)] hover:underline"
              >
                로그인
              </Link>
            </p>
          </>
        )}
      </section>
    </AppShell>
  );
}

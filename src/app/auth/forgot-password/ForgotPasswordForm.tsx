"use client";

/**
 * ForgotPasswordForm — /auth/forgot-password 본문 (클라이언트, Phase 2 2026-07-03).
 *
 * 이메일 1칸 → resetPasswordForEmail(redirectTo=/auth/reset-password).
 * 결과는 성공/실패 무관 동일 안내 — "가입된 이메일이라면 보냈어요" 로 통일해
 * 계정 존재 여부를 노출하지 않는다(user enumeration 방지). 단 rate limit 계열
 * 에러만 예외적으로 그 안내를 표시(재시도 시점을 알려야 하므로).
 *
 * 메일 링크: recovery 템플릿이 token_hash 링크({{ .SiteURL }}/auth/callback?token_hash=…&type=recovery,
 *   2026-07-03 설정)라 어느 기기/브라우저에서 열어도 동작(cross-device — PKCE code 링크의
 *   같은-브라우저 제약 회피). 콜백 verifyOtp 가 세션 확립 후 /auth/reset-password 로 라우팅.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITE_URL } from "@/lib/site";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      // SITE_URL(SSOT) — 메일 링크는 항상 canonical 도메인으로(검수 반영).
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: SITE_URL + "/auth/reset-password" },
      );
      // 계정 존재 여부 노출 방지 — rate limit 류만 예외 표시, 그 외는 성공과 동일 안내.
      if (resetErr) {
        const lower = resetErr.message.toLowerCase();
        if (lower.includes("rate limit") || lower.includes("for security purposes")) {
          setError("요청이 많아요 — 잠시 후 다시 시도해 주세요");
          return;
        }
      }
      setSent(true);
    });
  }

  return (
    <AppShell active="마이" wide keepCanvas>
      <section className="mx-auto w-full max-w-[400px] py-10">
        <h1 className="mb-1.5 text-center text-xl font-bold text-[var(--text)]">
          비밀번호 재설정
        </h1>
        <p className="mb-6 text-center text-[13px] text-[var(--text-muted)]">
          가입한 이메일로 재설정 링크를 보내드려요
        </p>
        {sent ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              가입된 이메일이라면 재설정 링크를 보냈어요. 받은편지함(스팸함
              포함)을 확인해 주세요.
            </p>
          </div>
        ) : (
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
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none caret-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25"
                placeholder="example@email.com"
                autoComplete="email"
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
              {isPending ? "보내는 중…" : "재설정 링크 받기"}
            </button>
          </form>
        )}
        <p className="mt-5 text-center text-[12.5px] text-[var(--text-secondary)]">
          <Link href="/login" className="hover:text-[var(--primary)] hover:underline">
            로그인 화면으로 돌아가기
          </Link>
        </p>
      </section>
    </AppShell>
  );
}

"use client";

/**
 * ResetPasswordForm — /auth/reset-password 본문 (클라이언트, Phase 2 2026-07-03).
 *
 * 진입 시 getSession() 으로 recovery 세션 확인 — 없으면(링크 만료·직접 진입)
 * 재요청 안내만 표시. 세션 있으면 새 비밀번호 ×2 입력 → updateUser({ password })
 * → 성공 시 토스트 + 풀 리로드 홈 이동(세션 쿠키가 server layout 에 동기되도록
 * LoginForm 선례와 동일하게 window.location.assign 사용).
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { showToast } from "@/lib/toast";
import { toKoreanError } from "@/lib/supabase-errors";

const INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none caret-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25";

export default function ResetPasswordForm() {
  // null = 세션 확인 중(로딩), true/false = 확인 완료.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      // getUser() — 서버 검증(검수 치명-2 반영). getSession() 은 로컬값만 봐서 만료·조작
      //   세션도 통과시킨다. 세션은 메일 링크(token_hash) → /auth/callback verifyOtp 가
      //   쿠키로 심어준 것을 여기서 확인.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setHasSession(!!user);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        // 서버 설정(secure password change, 2026-07-03)이 재설정 링크(recovery) 없이
        //   들어온 일반 세션의 비밀번호 변경을 거부한다 — 그 경우 친절 안내(검수 치명-2 반영).
        const lower = updateErr.message.toLowerCase();
        setError(
          lower.includes("reauthentication")
            ? "보안을 위해 메일의 재설정 링크를 통해서만 변경할 수 있어요 — 재설정을 다시 요청해 주세요."
            : toKoreanError(updateErr.message) || "비밀번호 변경에 실패했어요",
        );
        return;
      }
      showToast("비밀번호가 변경되었어요");
      // 풀 리로드 — 세션 쿠키가 server layout 과 동기되도록.
      window.location.assign("/");
    });
  }

  return (
    <AppShell active="마이" wide keepCanvas>
      <section className="mx-auto w-full max-w-[400px] py-10">
        <h1 className="mb-6 text-center text-xl font-bold text-[var(--text)]">
          새 비밀번호 설정
        </h1>
        {hasSession === null ? (
          <p className="text-center text-sm text-[var(--text-muted)]">
            확인 중…
          </p>
        ) : hasSession === false ? (
          <>
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                링크가 만료됐거나 잘못됐어요. 재설정을 다시 요청해 주세요.
              </p>
            </div>
            <p className="mt-5 text-center text-[12.5px] text-[var(--text-secondary)]">
              <Link
                href="/auth/forgot-password"
                className="font-semibold text-[var(--primary)] hover:underline"
              >
                재설정 다시 요청하기
              </Link>
            </p>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
          >
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">
                새 비밀번호 (8자 이상)
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
                새 비밀번호 확인
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
              {isPending ? "변경 중…" : "비밀번호 변경"}
            </button>
          </form>
        )}
      </section>
    </AppShell>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";
import { toKoreanError } from "@/lib/supabase-errors";

type Props = { next?: string; error?: string; errorId?: string };

/** STANDARD_ERROR_MESSAGES 동기화 — 클라 사이드 친절 매핑. */
const ERROR_KIND_LABELS: Record<string, string> = {
  auth_failed: "로그인 처리 중 오류가 발생했어요.",
  network_failed: "외부 서비스 연결에 실패했어요.",
  generic: "요청 처리 중 오류가 발생했어요.",
  unauthorized: "로그인이 필요합니다.",
  invalid_input: "입력값이 올바르지 않아요.",
};

export default function LoginForm({ next, error: initialError, errorId }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // initialError 가 kind 문자열이면 친절 메시지로 변환.
  const friendlyInitial = initialError
    ? ERROR_KIND_LABELS[initialError] ?? initialError
    : null;
  const [error, setError] = useState<string | null>(friendlyInitial);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        setError(toKoreanError(signInErr.message) || "로그인 실패");
        return;
      }
      // 로그인 후 역할에 따라 리다이렉트 — window.location.assign로 풀 리로드
      // (router.refresh로는 layout의 server-side cookies가 동기화 안 되는 경우 있음)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("세션 확인 실패");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      // 모든 role은 / 메인 피드로 (관리/내 글은 헤더 본인 아이콘으로 진입)
      const dest = next || "/";
      window.location.assign(dest);
    });
  }

  return (
    <div className="space-y-5">
      {/* 인앱 브라우저 감지 안내 (카카오톡/페이스북 등에서 구글 OAuth 차단됨) */}
      <InAppBrowserNotice />

      {/* 소셜 로그인 섹션 (= 실제 가입 입구) — 제목·설명은 화면 제목("피부텐텐 시작하기")과
          중복이라 제거하고, 버튼 아래 가입 안내 캡션으로 승격. */}
      <section
        className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
        aria-label="소셜 계정으로 시작하기"
      >
        <SocialLoginButtons next={next} />
        <p className="mt-3 text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
          처음이신가요? 위 버튼으로 시작하면 가입까지 자동으로 끝나요.
          <br />
          약관 동의는 다음 화면에서 받아요.
        </p>
      </section>

      {/* 구분선 */}
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-[var(--border)]" />
        <span className="mx-3 text-xs text-[var(--text-muted)]">
          또는 이메일로
        </span>
        <div className="flex-grow border-t border-[var(--border)]" />
      </div>

      {/* 기존 이메일/비밀번호 폼 */}
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
            placeholder="example@pibutenten.local"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none caret-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25"
            autoComplete="current-password"
          />
        </label>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <div>{error}</div>
            {errorId && (
              <div className="mt-1.5 text-xs text-red-600/80">
                계속 실패하면 아래 ID와 함께 알려주시면 빠르게 확인해 드려요.
                <br />
                <span className="font-mono">ID: {errorId}</span>
                <br />
                문의:{" "}
                <a
                  href={`mailto:pibutenten@gmail.com?subject=${encodeURIComponent(
                    `로그인 오류 문의 (${errorId})`,
                  )}`}
                  className="underline"
                >
                  pibutenten@gmail.com
                </a>
              </div>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="mt-2 w-full rounded-md bg-[var(--primary)] py-2 font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {isPending ? "로그인 중…" : "로그인"}
        </button>
      </form>

      {/* 이메일 가입·비밀번호 재설정 진입 — Phase 2(2026-07-03). */}
      <p className="text-center text-[12.5px] text-[var(--text-secondary)]">
        <Link
          href={
            next
              ? `/signup/email?next=${encodeURIComponent(next)}`
              : "/signup/email"
          }
          className="hover:text-[var(--primary)] hover:underline"
        >
          이메일로 가입하기
        </Link>
        <span className="mx-2 text-[var(--text-muted)]">·</span>
        <Link
          href="/auth/forgot-password"
          className="hover:text-[var(--primary)] hover:underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </p>
    </div>
  );
}

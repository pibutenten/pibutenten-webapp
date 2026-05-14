"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";

type Props = { next?: string; error?: string };

export default function LoginForm({ next, error: initialError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
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
        setError(signInErr.message || "로그인 실패");
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

      {/* 소셜 로그인 섹션 */}
      <section
        className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
        aria-labelledby="social-login-title"
      >
        <h2
          id="social-login-title"
          className="mb-3 text-sm font-semibold text-[var(--text)]"
        >
          소셜로 시작하기
        </h2>
        <SocialLoginButtons next={next} />
      </section>

      {/* 구분선 */}
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-[var(--border)]" />
        <span className="mx-3 text-xs text-[var(--text-muted)]">
          또는 이메일로 로그인
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
          />
        </label>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
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

      {/* 회원가입 안내 — 신규 사용자가 막히지 않도록 명시적 진입 */}
      <p className="text-center text-sm text-[var(--text-secondary)]">
        처음이신가요?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          회원가입
        </Link>
      </p>
    </div>
  );
}

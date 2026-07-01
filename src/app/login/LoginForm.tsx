"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  const socialRef = useRef<HTMLElement>(null);
  const [highlightSocial, setHighlightSocial] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  // 언마운트 시 하이라이트 타이머 정리 — 로그인 성공 후 이동 시 setState 경고 방지.
  useEffect(() => {
    return () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  // 신규 사용자를 소셜 로그인(= 실제 가입 입구)으로 유도.
  //   /signup 은 OAuth 성공 후 약관 게이트라 비로그인 진입 시 /login 으로 튕긴다.
  //   따라서 별도 페이지로 보내지 않고 같은 화면의 소셜 버튼으로 스크롤 + 하이라이트한다.
  function focusSocial() {
    socialRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightSocial(true);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightSocial(false), 1600);
  }

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

      {/* 소셜 로그인 섹션 (= 실제 가입 입구) */}
      <section
        ref={socialRef}
        className={`rounded-[var(--radius)] border bg-white p-5 shadow-[var(--shadow-sm)] transition ${
          highlightSocial
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/40"
            : "border-[var(--border)]"
        }`}
        aria-labelledby="social-login-title"
      >
        <h2
          id="social-login-title"
          className="text-sm font-semibold text-[var(--text)]"
        >
          소셜로 시작하기
        </h2>
        <p className="mb-3 text-[12px] text-[var(--text-muted)]">
          3초만에 가입 / 로그인 — 별도 비밀번호 없이 바로 시작해요.
        </p>
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

      {/* 회원가입 안내 — 소셜 로그인이 곧 가입. /signup(약관 게이트)로 보내면
          비로그인 상태에서 /login 으로 튕기므로, 위 소셜 버튼으로 유도한다. */}
      <p className="text-center text-sm text-[var(--text-secondary)]">
        처음이신가요?{" "}
        <button
          type="button"
          onClick={focusSocial}
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          소셜 계정으로 3초 만에 가입하기
        </button>
      </p>
    </div>
  );
}

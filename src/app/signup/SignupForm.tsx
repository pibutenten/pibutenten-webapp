"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  initialDisplayName: string;
  next?: string;
};

export default function SignupForm({ initialDisplayName, next }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      setError("닉네임은 1~30자 사이로 입력해 주세요.");
      return;
    }
    if (!ageConfirmed) {
      setError("만 14세 이상 확인이 필요해요.");
      return;
    }
    if (!termsAgreed) {
      setError("이용약관·개인정보 처리방침 동의가 필요해요.");
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("세션이 만료되었어요. 다시 로그인해 주세요.");
        return;
      }

      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          age_confirmed_at: now,
          terms_agreed_at: now,
          marketing_email_consent: marketingConsent,
        })
        .eq("id", user.id);

      if (updErr) {
        setError(updErr.message || "가입 정보 저장 실패");
        return;
      }

      // role 별 redirect (admin/doctor 계정이 OAuth로 들어올 수도 있으므로 안전하게 분기)
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, birthdate")
        .eq("id", user.id)
        .maybeSingle();
      const role = profile?.role ?? "user";

      // 일반 사용자 + 온보딩 미완료 → /onboarding 강제 게이트
      // (admin/doctor는 운영용 계정이라 스킵)
      if (role !== "admin" && role !== "doctor" && !profile?.birthdate) {
        // middleware가 이 쿠키 보면 /onboarding으로 강제 redirect
        try {
          document.cookie = `pibutenten_must_onboard=1; Path=/; Max-Age=${60 * 60 * 24}; SameSite=Lax`;
        } catch {
          /* ignore */
        }
        window.location.assign("/onboarding");
        return;
      }

      const dest =
        role === "admin"
          ? "/admin"
          : role === "doctor"
            ? "/me"
            : next || "/";
      window.location.assign(dest);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
    >
      {/* 닉네임 */}
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--text-secondary)]">닉네임</span>
        <input
          type="text"
          required
          maxLength={30}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none caret-[var(--primary)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25"
          placeholder="피부텐텐에서 사용할 이름"
        />
        <span className="mt-1 block text-xs text-[var(--text-muted)]">
          1~30자, 언제든지 마이페이지에서 바꿀 수 있어요.
        </span>
      </label>

      {/* 만 14세 */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-semibold text-[var(--text)]">[필수]</span>{" "}
          만 14세 이상입니다.
        </span>
      </label>

      {/* 약관 */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={termsAgreed}
          onChange={(e) => setTermsAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-semibold text-[var(--text)]">[필수]</span>{" "}
          이용약관 · 개인정보 처리방침에 동의합니다.
        </span>
      </label>

      {/* 마케팅 동의 (선택) */}
      <label className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-subtle,_#fafafa)] p-3 text-sm">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(e) => setMarketingConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-semibold text-[var(--text)]">
            피부 미용 트렌드, 피부텐텐이 가장 먼저 전해드릴게요 ✨
          </span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            (이메일 수신 · 광고성 정보 포함 · 언제든지 해지 가능)
          </span>
        </span>
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
        {isPending ? "저장 중…" : "가입 완료하고 시작하기"}
      </button>
    </form>
  );
}

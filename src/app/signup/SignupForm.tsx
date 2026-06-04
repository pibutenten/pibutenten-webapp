"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/identity-shared";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/consent-versions";

type Props = {
  initialDisplayName: string;
  next?: string;
};

export default function SignupForm({ initialDisplayName, next }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  // 필수 동의 3종 — 모두 디폴트 해제. 진행 버튼은 셋 다 체크돼야 활성.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  // 선택 동의 2종 — 디폴트 해제(opt-out 금지). 가입 시 명시값(false/true)으로 저장.
  const [newsConsent, setNewsConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 필수 3종 충족 여부 — 진행 버튼 활성 조건.
  const requiredOk = ageConfirmed && termsAgreed && privacyAgreed;
  // "전체 동의" 마스터 체크 상태 — 5개 모두 체크 시 on.
  const allChecked =
    ageConfirmed &&
    termsAgreed &&
    privacyAgreed &&
    newsConsent &&
    marketingConsent;

  function setAll(v: boolean) {
    setAgeConfirmed(v);
    setTermsAgreed(v);
    setPrivacyAgreed(v);
    setNewsConsent(v);
    setMarketingConsent(v);
  }

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
      setError("이용약관 동의가 필요해요.");
      return;
    }
    if (!privacyAgreed) {
      setError("개인정보 수집·이용 동의가 필요해요.");
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

      // B-5 (2026-05-29): age_confirmed_at 컬럼 DROP (마이그 0189). 만 14세 차단은
      // OnboardingClient 의 birthdate 검사로 재계산되므로 별도 timestamp 보존 불필요.
      //
      // F-1 (2026-06-04): 약관·개인정보를 별도 컬럼으로 분리 기록 + 동의 문서 버전 저장.
      //   선택 동의(news/marketing)는 가입 시 명시값(false/true)으로 저장 — NULL 은 옛 미질문 row 전용.
      //   각 동의 _at 은 동의(true) 시에만 now() 기록.
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          terms_agreed_at: now,
          terms_agreed_version: TERMS_VERSION,
          privacy_agreed_at: now,
          privacy_agreed_version: PRIVACY_VERSION,
          marketing_email_consent: marketingConsent,
          marketing_email_consent_at: marketingConsent ? now : null,
          news_email_consent: newsConsent,
          news_email_consent_at: newsConsent ? now : null,
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
      if (role !== ROLES.ADMIN && role !== ROLES.DOCTOR && !profile?.birthdate) {
        // middleware가 이 쿠키 보면 /onboarding으로 강제 redirect
        // Secure flag: HTTPS 환경에서만 자동 부여 (A11, 2026-05-17).
        try {
          const secureAttr =
            typeof window !== "undefined" &&
            window.location.protocol === "https:"
              ? "; Secure"
              : "";
          document.cookie = `pibutenten_must_onboard=1; Path=/; Max-Age=${60 * 60 * 24}; SameSite=Lax${secureAttr}`;
        } catch {
          /* ignore */
        }
        window.location.assign("/onboarding");
        return;
      }

      const dest =
        role === ROLES.ADMIN
          ? "/admin"
          : role === ROLES.DOCTOR
            ? "/settings"
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

      {/* 동의 묶음 */}
      <div className="rounded-md border border-[var(--border)]">
        {/* 전체 동의 마스터 */}
        <label className="flex items-start gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle,_#fafafa)] p-3 text-sm">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setAll(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span className="font-semibold text-[var(--text)]">전체 동의</span>
        </label>

        <div className="space-y-3 p-3">
          {/* [필수] 만 14세 */}
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

          {/* [필수] 이용약관 */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="font-semibold text-[var(--text)]">[필수]</span>{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] underline hover:text-[var(--primary-dark)]"
              >
                이용약관
              </a>
              에 동의합니다.
            </span>
          </label>

          {/* [필수] 개인정보 수집·이용 */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={privacyAgreed}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <span className="font-semibold text-[var(--text)]">[필수]</span>{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] underline hover:text-[var(--primary-dark)]"
              >
                개인정보 수집·이용
              </a>
              에 동의합니다.
            </span>
          </label>

          {/* [선택] 새 콘텐츠·업데이트 소식 수신 (디폴트 해제) */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={newsConsent}
              onChange={(e) => setNewsConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text)]">[선택]</span>{" "}
              피부텐텐의 새 Q&amp;A·콘텐츠 소식을 이메일로 받아봅니다. (선택)
            </span>
          </label>

          {/* [선택] 혜택·이벤트·광고성 정보 수신 (디폴트 해제) */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text)]">[선택]</span>{" "}
              피부텐텐의 혜택·이벤트 등 광고성 정보를 이메일로 받아봅니다. 언제든
              해지할 수 있습니다. (선택)
            </span>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !requiredOk}
        className="mt-2 w-full rounded-md bg-[var(--primary)] py-2 font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {isPending ? "저장 중…" : "가입 완료하고 시작하기"}
      </button>
    </form>
  );
}

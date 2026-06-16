"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  OAUTH_PROVIDERS,
  OAUTH_CALLBACK_PATH,
  siteOrigin,
  type OAuthProviderMeta,
} from "@/lib/auth/oauth-providers";
import { showToast } from "@/lib/toast";

type Props = {
  /** 로그인 성공 후 최종 도착할 페이지 (callback → 이 곳으로 redirect) */
  next?: string;
};

export default function SocialLoginButtons({ next }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(p: OAuthProviderMeta) {
    setError(null);

    // Naver 처럼 자체 OAuth 흐름 — server route로 이동
    // (state cookie 발급 + Naver authorize URL로 redirect)
    if (p.customStartPath) {
      setPendingId(p.id);
      const url = next
        ? `${p.customStartPath}?next=${encodeURIComponent(next)}`
        : p.customStartPath;
      window.location.assign(url);
      return;
    }

    if (!p.supabaseProvider) {
      showToast(p.disabledReason || "이 로그인은 곧 지원될 예정이에요.");
      return;
    }

    setPendingId(p.id);
    try {
      const supabase = createSupabaseBrowserClient();
      const origin = siteOrigin();
      const redirectTo = origin
        ? `${origin}${OAUTH_CALLBACK_PATH}${
            next ? `?next=${encodeURIComponent(next)}` : ""
          }`
        : OAUTH_CALLBACK_PATH;

      // 비즈 앱 전환 후엔 default scope 그대로 사용 가능 — SDK 정상 호출 (PKCE flow 보장)
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: p.supabaseProvider,
        options: { redirectTo },
      });
      if (oauthErr) {
        setError(oauthErr.message || "소셜 로그인 실패");
        setPendingId(null);
      }
      // 성공 시 브라우저가 provider OAuth 페이지로 이동
    } catch (e) {
      setError(e instanceof Error ? e.message : "소셜 로그인 실패");
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.map((p) => {
        const isPending = pendingId === p.id;
        const isDisabled = !p.supabaseProvider;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => handleClick(p)}
            disabled={isPending}
            // 색은 inline style 로 강제 — AppShell(.root) 의 unlayered button reset
            // (`background:none; color:inherit`)이 Tailwind 색 유틸을 이기기 때문(2026-06-16).
            style={{
              backgroundColor: p.bgColor,
              color: p.fgColor,
              border: p.borderColor ? `1px solid ${p.borderColor}` : "none",
            }}
            className={[
              "flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold transition-opacity",
              isPending ? "opacity-60 cursor-wait" : "hover:opacity-90",
              isDisabled ? "opacity-70" : "",
            ].join(" ")}
            aria-label={p.label}
          >
            <span
              className="inline-flex h-5 w-5 items-center justify-center"
              dangerouslySetInnerHTML={{ __html: p.iconSvg }}
            />
            <span>{isPending ? "이동 중…" : p.label}</span>
          </button>
        );
      })}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

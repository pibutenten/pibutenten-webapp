"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  OAUTH_PROVIDERS,
  OAUTH_CALLBACK_PATH,
  NATIVE_OAUTH_CALLBACK,
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

  /**
   * 네이티브(Capacitor) 여부 + Browser 플러그인을 동적 import 로 확인.
   *  - 모듈 최상위 import 를 피해 SSR/웹 빌드 안전성 보장(@capacitor 는 클릭 시에만 로드).
   *  - 웹에서는 isNative=false 라 기존 흐름 그대로.
   */
  async function loadNative(): Promise<{
    isNative: boolean;
    openBrowser: ((url: string) => Promise<void>) | null;
  }> {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return { isNative: false, openBrowser: null };
      const { Browser } = await import("@capacitor/browser");
      return {
        isNative: true,
        openBrowser: async (url: string) => {
          await Browser.open({ url });
        },
      };
    } catch {
      return { isNative: false, openBrowser: null };
    }
  }

  async function handleClick(p: OAuthProviderMeta) {
    setError(null);
    const { isNative, openBrowser } = await loadNative();

    // Naver 등 자체 OAuth 흐름 — server route 로 이동(state cookie 발급 + Naver authorize redirect).
    if (p.customStartPath) {
      setPendingId(p.id);
      const base = next
        ? `${p.customStartPath}?next=${encodeURIComponent(next)}`
        : p.customStartPath;
      if (isNative && openBrowser) {
        // 네이티브: 시스템 브라우저로 start 를 열고 native 플래그 전달
        //   → callback 이 custom scheme 딥링크로 token_hash 를 앱에 되돌려준다.
        const origin = siteOrigin();
        const url = `${origin}${base}${base.includes("?") ? "&" : "?"}native=1`;
        try {
          await openBrowser(url);
        } catch (e) {
          setError(e instanceof Error ? e.message : "로그인 창 열기 실패");
          setPendingId(null);
        }
      } else {
        window.location.assign(base);
      }
      return;
    }

    if (!p.supabaseProvider) {
      showToast(p.disabledReason || "이 로그인은 곧 지원될 예정이에요.");
      return;
    }

    setPendingId(p.id);
    try {
      const supabase = createSupabaseBrowserClient();

      if (isNative && openBrowser) {
        // 네이티브: 웹뷰 OAuth 차단(disallowed_useragent) 회피 — 시스템 브라우저로 띄운다.
        //   redirectTo = custom scheme. 복귀는 딥링크 핸들러(NativeAuthDeepLink)가 처리.
        //   PKCE verifier 는 이 웹뷰 쿠키에 저장 → 복귀 후 웹뷰 /auth/callback 에서 코드 교환.
        const redirectTo = `${NATIVE_OAUTH_CALLBACK}${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`;
        const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: p.supabaseProvider,
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (oauthErr || !data?.url) {
          setError(oauthErr?.message || "소셜 로그인 실패");
          setPendingId(null);
          return;
        }
        await openBrowser(data.url);
        // 복귀(딥링크)는 NativeAuthDeepLink 가 처리 → /auth/callback 코드교환
        return;
      }

      // 웹: 기존 흐름 (브라우저가 provider OAuth 페이지로 자동 이동)
      const origin = siteOrigin();
      const redirectTo = origin
        ? `${origin}${OAUTH_CALLBACK_PATH}${
            next ? `?next=${encodeURIComponent(next)}` : ""
          }`
        : OAUTH_CALLBACK_PATH;
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: p.supabaseProvider,
        options: { redirectTo },
      });
      if (oauthErr) {
        setError(oauthErr.message || "소셜 로그인 실패");
        setPendingId(null);
      }
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

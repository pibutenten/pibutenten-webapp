/**
 * 소셜 로그인 Provider 메타데이터.
 *
 *  - Google/Kakao/Apple: Supabase native (`signInWithOAuth`)
 *  - Naver: Supabase 미지원 → 자체 OAuth 흐름 (`/api/auth/naver/start` 진입)
 *
 *  Apple 은 App Store 심사 가이드라인 4.8(타사 소셜 로그인 제공 시 Apple 로그인 필수)
 *  대비로 추가. Services ID `kr.pibutenten.web` = web client_id. 콜백은 Supabase
 *  `/auth/v1/callback` → 사이트 `/auth/callback` 으로 이어지는 기존 PKCE 흐름 공유.
 *  Client Secret(JWT)은 최대 6개월 만료 — 자동 갱신 cron 으로 관리(RUNBOOK 참조).
 */

export type OAuthProviderId = "google" | "kakao" | "apple" | "naver";

export type OAuthProviderMeta = {
  id: OAuthProviderId;
  /** 버튼에 표시되는 한국어 라벨 */
  label: string;
  /** Supabase signInWithOAuth 가 받는 provider 키 (Naver 처럼 자체 흐름이면 null) */
  supabaseProvider: "google" | "kakao" | "apple" | null;
  /** Naver 처럼 자체 OAuth 흐름이면 시작 URL — 클릭 시 이쪽으로 이동 */
  customStartPath?: string;
  /**
   * 브랜드 배경/글자/테두리 색 — **inline style 용 hex**.
   *   AppShell(.root) 의 `:where(.root) button { background:none; color:inherit }`
   *   reset 이 layer 밖(unlayered)이라 Tailwind 색 유틸(@layer utilities)을 이긴다.
   *   → 소셜 버튼은 className 대신 inline style 로 색을 강제해 reset 을 우회한다.
   */
  bgColor: string;
  /** 글자색 (hex) */
  fgColor: string;
  /** 테두리 색 (hex, 있을 경우) */
  borderColor?: string;
  /** 단색 SVG 로고 (currentColor 기반) */
  iconSvg: string;
  /** 비활성/지원 예정 안내 */
  disabledReason?: string;
};

/**
 * Supabase 에 등록된 동일 도메인 redirect URL 목록과 매칭되는 콜백 경로.
 * .env 또는 사이트 URL 기반으로 조립한다.
 */
export const OAUTH_CALLBACK_PATH = "/auth/callback";

export const OAUTH_PROVIDERS: OAuthProviderMeta[] = [
  {
    id: "google",
    label: "Google로 시작하기",
    supabaseProvider: "google",
    bgColor: "#ffffff",
    fgColor: "#1f1f1f",
    borderColor: "#dadce0",
    iconSvg: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>`,
  },
  {
    id: "apple",
    label: "Apple로 시작하기",
    supabaseProvider: "apple",
    bgColor: "#000000",
    fgColor: "#ffffff",
    iconSvg: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#ffffff" d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"/>
    </svg>`,
  },
  {
    id: "kakao",
    label: "카카오로 시작하기",
    supabaseProvider: "kakao",
    bgColor: "#FEE500",
    fgColor: "#191919",
    iconSvg: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#191919" d="M12 3C6.477 3 2 6.5 2 10.83c0 2.78 1.86 5.22 4.66 6.6l-.99 3.62c-.09.32.27.58.55.4l4.34-2.86c.47.05.95.08 1.44.08 5.523 0 10-3.5 10-7.84S17.523 3 12 3z"/>
    </svg>`,
  },
  {
    id: "naver",
    label: "네이버로 시작하기",
    supabaseProvider: null,
    customStartPath: "/api/auth/naver/start",
    bgColor: "#03C75A",
    fgColor: "#ffffff",
    iconSvg: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#ffffff" d="M16.273 12.845L7.376 0H0v24h7.726V11.155L16.624 24H24V0h-7.727z"/>
    </svg>`,
  },
];

/**
 * 사이트 origin 을 안전하게 얻기 (브라우저 전용).
 * SSR 에서는 빈 문자열 반환 → window 가용 시점에 다시 조립.
 */
export function siteOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * 소셜 로그인 Provider 메타데이터.
 *
 * Supabase Auth 가 직접 지원하는 provider 만 `supported: true`.
 * Naver 는 Supabase 비공식 → "곧 지원됩니다" 안내용으로만 노출.
 */

export type OAuthProviderId = "google" | "kakao" | "naver";

export type OAuthProviderMeta = {
  id: OAuthProviderId;
  /** 버튼에 표시되는 한국어 라벨 */
  label: string;
  /** Supabase signInWithOAuth 가 받는 provider 키 (Naver 는 미지원) */
  supabaseProvider: "google" | "kakao" | null;
  /** 배경색 (브랜드 가이드 기준) */
  bgClass: string;
  /** 글자색 */
  textClass: string;
  /** 테두리 (있을 경우) */
  borderClass?: string;
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
    bgClass: "bg-white",
    textClass: "text-[#1f1f1f]",
    borderClass: "border border-[#dadce0]",
    iconSvg: `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>`,
  },
  {
    id: "kakao",
    label: "카카오로 시작하기",
    supabaseProvider: "kakao",
    bgClass: "bg-[#FEE500]",
    textClass: "text-[#191919]",
    iconSvg: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">
      <path fill="#191919" d="M12 3C6.477 3 2 6.5 2 10.83c0 2.78 1.86 5.22 4.66 6.6l-.99 3.62c-.09.32.27.58.55.4l4.34-2.86c.47.05.95.08 1.44.08 5.523 0 10-3.5 10-7.84S17.523 3 12 3z"/>
    </svg>`,
  },
  {
    id: "naver",
    label: "네이버로 시작하기",
    supabaseProvider: null,
    bgClass: "bg-[#03C75A]",
    textClass: "text-white",
    disabledReason: "네이버 로그인은 곧 지원될 예정이에요.",
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

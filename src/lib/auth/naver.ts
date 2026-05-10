/**
 * 네이버 OAuth 2.0 헬퍼.
 *
 * Supabase Auth는 Naver를 native provider로 지원하지 않으므로
 * 자체 OAuth 흐름을 구현하고 Supabase admin SDK로 사용자 동기화한다.
 *
 * 표준 RFC 6749 Authorization Code Grant Flow.
 *  - 1) authorize URL로 리다이렉트 (state cookie로 CSRF 방어)
 *  - 2) callback에서 code 교환 → access_token
 *  - 3) access_token으로 user info 조회
 *  - 4) email/name 기준 Supabase 사용자 생성/조회
 *  - 5) generateLink로 magic link 발급 → 자동 세션 발급
 *
 * 참고: https://developers.naver.com/docs/login/api/api.md
 */

const NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
const NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const NAVER_USERINFO_URL = "https://openapi.naver.com/v1/nid/me";

export type NaverUserInfo = {
  /** 네이버 고유 식별자 (이메일 변경에도 유지) */
  id: string;
  email?: string;
  name?: string;
  nickname?: string;
  profile_image?: string;
  birthday?: string; // "MM-DD"
  birthyear?: string; // "YYYY"
  gender?: "M" | "F" | "U";
  mobile?: string;
};

export type NaverEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** 환경 변수에서 Naver 자격증명 로드 — 없으면 null (UI에서 비활성화 처리) */
export function loadNaverEnv(siteUrl: string): NaverEnv | null {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl.replace(/\/$/, "")}/api/auth/naver/callback`,
  };
}

/** Naver authorize URL 생성 */
export function buildNaverAuthorizeUrl(env: NaverEnv, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    state,
  });
  return `${NAVER_AUTHORIZE_URL}?${params.toString()}`;
}

/** code → access_token 교환 */
export async function exchangeNaverCode(
  env: NaverEnv,
  code: string,
  state: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    state,
  });
  const res = await fetch(`${NAVER_TOKEN_URL}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Naver token exchange 실패: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: string | number;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new Error(
      `Naver token 응답 오류: ${json.error_description ?? json.error ?? "no access_token"}`,
    );
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in:
      typeof json.expires_in === "string"
        ? Number.parseInt(json.expires_in, 10)
        : json.expires_in,
  };
}

/** access_token으로 사용자 정보 조회 */
export async function fetchNaverUserInfo(
  accessToken: string,
): Promise<NaverUserInfo> {
  const res = await fetch(NAVER_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Naver user info 실패: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    resultcode?: string;
    message?: string;
    response?: NaverUserInfo;
  };
  if (json.resultcode !== "00" || !json.response) {
    throw new Error(`Naver user info 오류: ${json.message ?? "unknown"}`);
  }
  return json.response;
}

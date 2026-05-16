/**
 * YouTube Data API v3 OAuth 자막 fetch — 피부텐텐 본인 채널 영상용 최우선 경로.
 *
 * 작동 조건 (2026-05-16 migration 0097 이후):
 *   - CLIENT_ID / _SECRET 은 .env.local (admin이 직접 입력)
 *   - refresh_token 은 youtube_oauth_tokens DB 테이블 우선, .env.local fallback (호환)
 *   - 셋 중 하나라도 없으면 isOauthAvailable() = false → 호출자는 watch-page 등 fallback로.
 *
 * 흐름:
 *   1) refresh_token (DB > env) → access_token (https://oauth2.googleapis.com/token, in-memory cache)
 *   2) captions.list?videoId=... → 자막 트랙 목록
 *   3) 트랙 우선순위: 한국어 수동 > 한국어 자동(ASR) > 영어 수동 > 그 외
 *   4) captions.download?id=...&tfmt=srt → SRT 텍스트
 *   5) SRT 파싱 → plain text
 *
 * 주의:
 *   - 자동자막(ASR)은 download 시도해도 403 받는 경우가 많음 — 호출자가 다음 트랙으로 fallback.
 *   - 외부 채널 영상은 본질적으로 download 거부 (403 forbidden / 자막 트랙 자체가 안 보임).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OauthCaptionResult = {
  text: string;
  /** "ko-manual" | "ko-auto" | "en" | "default" — UI source 라벨에 사용 */
  source: "ko-manual" | "ko-auto" | "en" | "default";
  /** 사용된 트랙 id (디버그용) */
  trackId: string;
};

type CaptionTrack = {
  id: string;
  snippet: {
    language: string; // BCP-47 ("ko", "en", ...)
    trackKind?: string; // "standard" / "ASR"
    name?: string;
  };
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
// refresh_token DB cache — 매 호출마다 DB 왕복 피하기 위해 60초 캐싱.
let cachedRefreshToken: { token: string; expiresAt: number } | null = null;

/** DB(youtube_oauth_tokens) 우선, env fallback. 호환성 위해 둘 다 지원. */
async function getRefreshToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedRefreshToken && cachedRefreshToken.expiresAt > now) {
    return cachedRefreshToken.token;
  }
  // DB 우선
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("youtube_oauth_tokens")
      .select("refresh_token")
      .eq("provider", "google-youtube")
      .maybeSingle();
    const dbToken = (data as { refresh_token?: string } | null)?.refresh_token;
    if (dbToken) {
      cachedRefreshToken = { token: dbToken, expiresAt: now + 60_000 };
      return dbToken;
    }
  } catch {
    // DB 접근 실패는 env fallback으로
  }
  // env fallback — **production 차단** (2026-05-17): 운영에서는 DB only.
  // dev 환경에서는 .env.local 의 YOUTUBE_OAUTH_REFRESH_TOKEN 으로 초기 세팅 가능.
  // 운영 배포된 코드에서 env fallback 이 살아 있으면 시크릿 평문 노출 위험.
  if (process.env.NODE_ENV !== "production") {
    const envToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;
    if (envToken) {
      cachedRefreshToken = { token: envToken, expiresAt: now + 60_000 };
      return envToken;
    }
  }
  return null;
}

/** OAuth 활성 여부 — client_id/secret은 env, refresh_token은 DB 또는 env */
export async function isOauthAvailable(): Promise<boolean> {
  if (
    !process.env.YOUTUBE_OAUTH_CLIENT_ID ||
    !process.env.YOUTUBE_OAUTH_CLIENT_SECRET
  ) {
    return false;
  }
  const rt = await getRefreshToken();
  return Boolean(rt);
}

/** refresh_token이 만료/취소된 경우 throw. 호출자가 잡아서 "재인증 필요" UX 노출. */
export class OauthRefreshExpiredError extends Error {
  constructor(public detail: string) {
    super(`OAuth refresh_token expired or revoked: ${detail}`);
    this.name = "OauthRefreshExpiredError";
  }
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("OAuth refresh_token not configured (DB nor env)");
  }
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // invalid_grant = refresh_token 만료/취소. 별도 에러 클래스로 throw.
    if (res.status === 400 && /invalid_grant/i.test(text)) {
      throw new OauthRefreshExpiredError(text.slice(0, 200));
    }
    throw new Error(
      `OAuth token refresh failed: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("OAuth response missing access_token");
  const ttl = (j.expires_in ?? 3600) * 1000;
  cachedAccessToken = { token: j.access_token, expiresAt: now + ttl };
  return j.access_token;
}

/**
 * OAuth 상태 확인 — refresh_token 갱신 시도해 유효 여부 반환.
 * /admin 카드·draft 위저드 등에서 호출해 상태 라벨 결정.
 */
export type OauthHealth =
  | { state: "disabled" } // env 미설정
  | { state: "ok"; expiresAt: number }
  | { state: "expired"; detail: string }
  | { state: "error"; detail: string };

export async function checkOauthHealth(): Promise<OauthHealth> {
  if (!(await isOauthAvailable())) return { state: "disabled" };
  try {
    await getAccessToken();
    return {
      state: "ok",
      expiresAt: cachedAccessToken?.expiresAt ?? Date.now(),
    };
  } catch (e) {
    if (e instanceof OauthRefreshExpiredError) {
      return { state: "expired", detail: e.detail };
    }
    return {
      state: "error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function listCaptions(
  videoId: string,
  accessToken: string,
): Promise<CaptionTrack[]> {
  const url = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `captions.list HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const j = (await res.json()) as { items?: CaptionTrack[] };
  return j.items ?? [];
}

async function downloadCaption(
  trackId: string,
  accessToken: string,
): Promise<string> {
  // tfmt=srt: SRT 형식 (간단 파싱 가능). vtt도 가능하나 SRT가 더 작음.
  const url = `https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(trackId)}?tfmt=srt`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `captions.download HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  return await res.text();
}

/** SRT → plain text. 타임코드·인덱스 줄 제거하고 자막 본문만 공백으로 합침. */
function srtToPlainText(srt: string): string {
  const lines = srt.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) continue; // 인덱스 줄
    if (/^\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s+-->/.test(t)) continue; // 타임코드 줄
    // HTML 태그 제거 (자막에 <i>, <b> 등 가끔 있음)
    const cleaned = t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (cleaned) out.push(cleaned);
  }
  return out.join(" ");
}

/**
 * 트랙 우선순위 선택.
 * 1) ko + standard (수동 한국어)
 * 2) ko + ASR (자동 한국어)
 * 3) en + standard
 * 4) 어떤 standard이든
 * 5) 어떤 트랙이든
 */
function pickTrack(
  tracks: CaptionTrack[],
): { track: CaptionTrack; source: OauthCaptionResult["source"] } | null {
  const isAsr = (t: CaptionTrack) => (t.snippet.trackKind ?? "").toUpperCase() === "ASR";
  const ko = tracks.filter((t) => t.snippet.language === "ko");
  const koManual = ko.find((t) => !isAsr(t));
  if (koManual) return { track: koManual, source: "ko-manual" };
  const koAuto = ko.find(isAsr);
  if (koAuto) return { track: koAuto, source: "ko-auto" };
  const enManual = tracks.find(
    (t) => t.snippet.language === "en" && !isAsr(t),
  );
  if (enManual) return { track: enManual, source: "en" };
  const anyManual = tracks.find((t) => !isAsr(t));
  if (anyManual) return { track: anyManual, source: "default" };
  if (tracks[0]) return { track: tracks[0], source: "default" };
  return null;
}

/**
 * OAuth로 영상 자막 fetch 시도.
 * 성공: text + source 반환.
 * 실패 또는 트랙 없음: null.
 * env 미설정: null (호출 전에 isOauthAvailable() 확인 권장).
 */
export async function fetchCaptionsViaOauth(
  videoId: string,
): Promise<OauthCaptionResult | null> {
  if (!(await isOauthAvailable())) return null;
  try {
    const token = await getAccessToken();
    const tracks = await listCaptions(videoId, token);
    if (!tracks.length) return null;
    const pick = pickTrack(tracks);
    if (!pick) return null;
    // ASR(자동자막)은 download 시 403 받는 경우 많음. 그래도 시도, 실패하면 null.
    const srt = await downloadCaption(pick.track.id, token);
    const text = srtToPlainText(srt).trim();
    if (text.length < 20) return null;
    return { text, source: pick.source, trackId: pick.track.id };
  } catch (e) {
    // 외부 영상·자동자막 등 download 거부는 정상 케이스. 로그만 남기고 호출자에게 null 반환.
    console.warn(
      `[youtube-oauth] caption fetch failed for ${videoId}:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

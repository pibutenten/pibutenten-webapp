import "server-only";
import crypto from "node:crypto";
import { unstable_cache } from "next/cache";
import type { ScRow } from "@/lib/traffic-types";

/**
 * Google Search Console — 상위 유입 검색어 조회 (관리자 대시보드용).
 *
 * "무슨 검색어로 우리를 찾았는지"는 검색엔진 referrer 로 알 수 없고(§유입 분석), GSC Search
 * Analytics API 만이 제공한다. 서비스 계정(JWT, 서버-서버)으로 인증 — 사용자 재동의 불필요.
 *
 * 자격증명(env, 미설정 시 위젯이 '설정 필요' 안내):
 *   - GOOGLE_SC_SA_EMAIL        서비스 계정 이메일
 *   - GOOGLE_SC_SA_PRIVATE_KEY  서비스 계정 개인키(PEM, 줄바꿈은 \n 로 이스케이프해 저장)
 *   - GOOGLE_SC_SITE_URL        속성 식별자(URL 접두어면 https://pibutenten.kr/ · 도메인이면 sc-domain:pibutenten.kr)
 * ⚠ 위 SA 이메일을 Search Console → 설정 → 사용자 및 권한에 '전체' 또는 '제한'으로 추가해야 조회됨.
 *
 * 데이터는 하루 단위·2~3일 지연 → 6시간 캐시(quota 절약). readonly 스코프만 사용.
 */

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// 검색어 1행 타입은 클라(SearchConsolePanel)와 공유 — @/lib/traffic-types(클라 안전)에서 통합.
export type ScResult =
  | { ok: true; rows: ScRow[] }
  | { ok: false; reason: "unconfigured" | "error"; message?: string };

function creds() {
  const email = process.env.GOOGLE_SC_SA_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SC_SA_PRIVATE_KEY;
  const site = process.env.GOOGLE_SC_SITE_URL?.trim();
  if (!email || !rawKey || !site) return null;
  // env 저장 시 개행이 \n 리터럴로 들어오는 경우가 흔함 → 실제 개행으로 복원.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return { email, privateKey, site };
}

let cachedToken: { token: string; exp: number } | null = null;

/** 서비스 계정 JWT(RS256) 서명 → 액세스 토큰 교환(1시간, in-memory 캐시). */
async function getAccessToken(email: string, privateKey: string): Promise<string> {
  if (cachedToken && cachedToken.exp - 60 > Math.floor(Date.now() / 1000)) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claim}`)
    .sign(privateKey, "base64url");
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 실제 GSC 호출(캐시 미적용) — startDate/endDate 는 오늘 기준 상대. */
async function fetchTopQueriesRaw(days: number, limit: number): Promise<ScResult> {
  const c = creds();
  if (!c) return { ok: false, reason: "unconfigured" };
  try {
    const token = await getAccessToken(c.email, c.privateKey);
    const end = new Date();
    const start = new Date();
    // GSC 는 2~3일 지연 → 종료일을 3일 전으로 당겨 빈 구간 방지.
    end.setDate(end.getDate() - 3);
    start.setDate(start.getDate() - 3 - days);
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.site)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: ymd(start),
          endDate: ymd(end),
          dimensions: ["query"],
          rowLimit: limit,
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, reason: "error", message: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const j = (await res.json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
    };
    const rows: ScRow[] = (j.rows ?? []).map((r) => ({
      query: r.keys[0] ?? "",
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position,
    }));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * 6시간 캐시 래퍼(quota 절약·GSC 일 단위 갱신).
 * keyParts 에 함수 인수(days,limit)를 명시적으로 넣지 못하므로(정적) tags 로 기간별 분리 —
 *   revalidateTag 수동 무효화도 가능(프로젝트 tags 관행 정합). 인수는 unstable_cache 가
 *   내부적으로 키에 반영하나, tags 로 기간 구분을 이중 보장한다.
 */
export const getTopSearchQueries = unstable_cache(
  async (days: number, limit: number) => fetchTopQueriesRaw(days, limit),
  ["gsc-top-queries"],
  { revalidate: 21600, tags: ["gsc-top-queries"] },
);

/** 자격증명이 갖춰졌는지(위젯 설정 안내 분기용). */
export function isSearchConsoleConfigured(): boolean {
  return creds() !== null;
}

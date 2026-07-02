/**
 * GET /api/admin/youtube-oauth/callback
 *
 * Google 동의 후 ?code= 받음 → access_token + refresh_token 교환 →
 * youtube_oauth_tokens 테이블에 service_role로 upsert.
 *
 * 보안 (2026-05-16 migration 0097):
 *   - 이전: .env.local 평문 write + HTML <pre>에 refresh_token 평문 출력 → 노출 위험
 *   - 현재: DB 저장 + HTML에 token 미노출 (인증 완료 텍스트만)
 *
 * 응답: HTML 페이지로 성공 메시지만.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { safeEqual } from "@/lib/auth/timing";
import { YOUTUBE_OAUTH_STATE_COOKIE } from "@/app/api/admin/youtube-oauth/start/route";

/** 외부 유래 문자열(query param, OAuth 응답)의 HTML 출력용 이스케이프 — reflected XSS 차단. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const dynamic = "force-dynamic";

function getRedirectUri(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return `${explicit}/api/admin/youtube-oauth/callback`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}/api/admin/youtube-oauth/callback`;
  return "http://localhost:3000/api/admin/youtube-oauth/callback";
}

function htmlPage(title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:48px auto;padding:0 16px;line-height:1.6;color:#111}
h1{margin:0 0 16px}
.ok{color:#1B7E48;background:#E8F5EE;border:1px solid #B5DDC5;padding:12px 16px;border-radius:8px}
.err{color:#B42318;background:#FEF3F2;border:1px solid #FECDCA;padding:12px 16px;border-radius:8px}
code{background:#F4F4F5;padding:2px 6px;border-radius:4px;word-break:break-all}
pre{background:#F4F4F5;padding:12px;border-radius:6px;overflow-x:auto}
a{color:#1B4965}</style></head>
<body>${body}</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  // Phase 5-6: callback 도 admin 권한 강제 — 비관리자가 우연/악의적으로
  // 콜백 URL 에 접근해도 토큰 교환을 시도하지 않도록 한다.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return htmlPage(
      "OAuth 동의 거부",
      `<h1>❌ OAuth 동의 실패</h1>
       <p class="err">Google 측 오류: <code>${escapeHtml(errorParam)}</code></p>
       <p><a href="/api/admin/youtube-oauth/start">다시 시도</a></p>`,
    );
  }
  if (!code) {
    return htmlPage(
      "OAuth 콜백",
      `<h1>잘못된 접근</h1><p>인가 코드가 없습니다.</p>`,
    );
  }

  // Phase 5-6: CSRF state 검증 — 쿠키와 URL 의 state 가 일치해야만 토큰 교환 진행.
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(YOUTUBE_OAUTH_STATE_COOKIE)?.value ?? null;
  // 1회용 — 사용 직후 즉시 삭제
  if (cookieState) {
    cookieStore.set(YOUTUBE_OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      path: "/",
    });
  }
  // timing-safe 비교 (@/lib/auth/timing 공통 헬퍼) — `===` 조기 종료 side-channel 차단.
  if (!cookieState || !stateParam || !safeEqual(stateParam, cookieState)) {
    return htmlPage(
      "CSRF 검증 실패",
      `<h1>❌ state 불일치</h1>
       <p class="err">OAuth state 가 일치하지 않습니다 (CSRF 방어).</p>
       <p><a href="/api/admin/youtube-oauth/start">다시 시도</a></p>`,
    );
  }

  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return htmlPage(
      "OAuth 설정 누락",
      `<h1>❌ 클라이언트 설정 누락</h1>
       <p class="err">.env.local에 YOUTUBE_OAUTH_CLIENT_ID / _SECRET 필요</p>`,
    );
  }

  // code → token 교환
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || tokenJson.error || !tokenJson.refresh_token) {
    return htmlPage(
      "토큰 교환 실패",
      `<h1>❌ 토큰 교환 실패</h1>
       <p class="err">${escapeHtml(tokenJson.error ?? "unknown")}: ${escapeHtml(tokenJson.error_description ?? "")}</p>
       <pre>${escapeHtml(JSON.stringify(tokenJson, null, 2))}</pre>
       <p>refresh_token이 안 오면 보통 두 가지 원인입니다:
       <br>1) OAuth Playground 등에서 이미 받은 적이 있어 prompt=consent 없이 재발급됨 — 본 흐름은 prompt=consent 명시되어 있으니 정상.
       <br>2) .env.local의 client_id/secret이 잘못됨.</p>
       <p><a href="/api/admin/youtube-oauth/start">다시 시도</a></p>`,
    );
  }

  // youtube_oauth_tokens 테이블에 upsert — service_role 키로 RLS 우회.
  // singleton: provider = 'google-youtube' 한 row만 유지.
  let dbResult = "";
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("youtube_oauth_tokens").upsert(
      {
        provider: "google-youtube",
        client_id: clientId,
        refresh_token: tokenJson.refresh_token,
        scope: tokenJson.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) {
      console.error("[youtube-oauth callback] DB upsert error", error);
      dbResult = "⚠ DB 저장 실패 — 서버 로그를 확인해주세요.";
    } else {
      dbResult = "✅ refresh_token이 DB에 안전하게 저장되었습니다.";
    }
  } catch (e) {
    console.error("[youtube-oauth callback] DB upsert threw", e);
    dbResult = "⚠ DB 저장 예외 발생 — 서버 로그를 확인해주세요.";
  }

  return htmlPage(
    "YouTube OAuth 완료",
    `<h1>✅ YouTube OAuth 연동 완료</h1>
     <p class="ok">${dbResult}</p>
     <h3>다음 단계</h3>
     <ol>
       <li><a href="/admin/draft">/admin/draft (Q&A 추출하기)</a>로 가서 본인 채널 영상 URL 입력</li>
       <li>자막이 OAuth 트랙(<code>ko-manual</code>)으로 표시되면 성공</li>
     </ol>
     <p style="margin-top:24px;font-size:12px;color:#666">
       토큰은 화면에 표시되지 않습니다 (보안). 재발급이 필요하면
       <a href="/api/admin/youtube-oauth/start">여기서 다시 인증</a>하면 DB가 자동 갱신됩니다.
     </p>`,
  );
}

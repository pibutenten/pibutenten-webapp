/**
 * GET /api/admin/youtube-oauth/callback
 *
 * Google 동의 후 ?code= 받음 → access_token + refresh_token 교환 →
 * dev 환경이면 .env.local에 YOUTUBE_OAUTH_REFRESH_TOKEN 자동 저장.
 *
 * 응답: HTML 페이지로 성공 메시지 + dev 서버 재시작 안내.
 */

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const REDIRECT_URI =
  "http://localhost:3000/api/admin/youtube-oauth/callback";

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
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return htmlPage(
      "OAuth 동의 거부",
      `<h1>❌ OAuth 동의 실패</h1>
       <p class="err">Google 측 오류: <code>${errorParam}</code></p>
       <p><a href="/api/admin/youtube-oauth/start">다시 시도</a></p>`,
    );
  }
  if (!code) {
    return htmlPage(
      "OAuth 콜백",
      `<h1>잘못된 접근</h1><p>인가 코드가 없습니다.</p>`,
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
    redirect_uri: REDIRECT_URI,
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
       <p class="err">${tokenJson.error ?? "unknown"}: ${tokenJson.error_description ?? ""}</p>
       <pre>${JSON.stringify(tokenJson, null, 2)}</pre>
       <p>refresh_token이 안 오면 보통 두 가지 원인입니다:
       <br>1) OAuth Playground 등에서 이미 받은 적이 있어 prompt=consent 없이 재발급됨 — 본 흐름은 prompt=consent 명시되어 있으니 정상.
       <br>2) .env.local의 client_id/secret이 잘못됨.</p>
       <p><a href="/api/admin/youtube-oauth/start">다시 시도</a></p>`,
    );
  }

  // dev 환경 — .env.local 자동 갱신
  let envWriteResult = "";
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      let envText = fs.readFileSync(envPath, "utf8");
      const refreshLine = `YOUTUBE_OAUTH_REFRESH_TOKEN=${tokenJson.refresh_token}`;
      if (/^YOUTUBE_OAUTH_REFRESH_TOKEN=.*$/m.test(envText)) {
        envText = envText.replace(
          /^YOUTUBE_OAUTH_REFRESH_TOKEN=.*$/m,
          refreshLine,
        );
      } else {
        envText = envText.replace(/\s*$/, "") + "\n" + refreshLine + "\n";
      }
      fs.writeFileSync(envPath, envText, "utf8");
      envWriteResult = `✅ .env.local 자동 갱신됨 (${envPath})`;
    } else {
      envWriteResult =
        "⚠ .env.local 파일이 없습니다 — 아래 값을 수동으로 추가하세요.";
    }
  } catch (e) {
    envWriteResult = `⚠ .env.local 자동 갱신 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  return htmlPage(
    "YouTube OAuth 완료",
    `<h1>✅ YouTube OAuth 연동 완료</h1>
     <p class="ok">refresh_token이 발급되었습니다.</p>
     <p>${envWriteResult}</p>
     <h3>refresh_token (수동 추가 필요할 때):</h3>
     <pre>YOUTUBE_OAUTH_REFRESH_TOKEN=${tokenJson.refresh_token}</pre>
     <h3>다음 단계</h3>
     <ol>
       <li>dev 서버 재시작 (Ctrl+C → npm run dev) — Next.js가 .env 변경을 반영하려면 필수</li>
       <li><a href="/admin/draft">/admin/draft (Q&A 추출하기)</a>로 가서 본인 채널 영상 URL 입력</li>
       <li>자막이 OAuth 트랙(<code>ko-manual</code>)으로 표시되면 성공</li>
     </ol>
     <p style="margin-top:24px;font-size:12px;color:#666">scope: ${tokenJson.scope}</p>`,
  );
}

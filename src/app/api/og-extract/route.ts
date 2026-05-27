import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeFetchExternal } from "@/lib/ssrf-guard";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";

/**
 * 외부 URL의 Open Graph 메타 추출.
 *
 * POST /api/og-extract  body: { url: string }
 * Response: { ok: true, data: { title, description, image, siteName, canonical } }
 *           | { ok: false, error: string }
 *
 * 사용처: WriteClient에서 사용자가 외부 링크 입력 시 → 카드 자동 생성.
 *
 * 보안 (Phase 6-2):
 *  - 로그인 사용자만 호출 가능 (anon DoS 방지)
 *  - https only
 *  - DNS 해석 후 사설 IP / 로컬호스트 / 클라우드 메타데이터 차단 (lib/ssrf-guard)
 *  - redirect hop 별 host 재검증
 *  - timeout 6s, 응답 크기 1MB 상한
 */

const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024; // 1MB

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html: string, property: string): string | null {
  // og:property 또는 name="property" 매칭
  const re = new RegExp(
    `<meta\\s+(?:[^>]*?\\s)?(?:property|name)\\s*=\\s*["']${property.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    )}["']\\s+(?:[^>]*?\\s)?content\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const m = re.exec(html);
  return m ? unescapeHtml(m[1]).trim() : null;
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m ? unescapeHtml(m[1]).trim() : null;
}

function extractCanonical(html: string): string | null {
  const m =
    /<link\s+(?:[^>]*?\s)?rel\s*=\s*["']canonical["']\s+(?:[^>]*?\s)?href\s*=\s*["']([^"']*)["']/i.exec(
      html,
    );
  return m ? m[1].trim() : null;
}

export async function POST(request: NextRequest) {
  // Phase 6-2: 인증 필수 (anon DoS 방지)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // 호출자(WriteClient) 가 ok 플래그 분기 — bodyExtra 로 `ok: false` 유지.
    return errorResponse(null, "unauthorized", "[og-extract] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다",
      bodyExtra: { ok: false },
    });
  }

  // Rate limit (A8): 사용자당 분당 30회.
  const limited = await rateLimit({
    request,
    bucketPrefix: "og-extract",
    userId: user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch (e) {
    return errorResponse(e, "invalid_input", "[og-extract] body parse", 400, undefined, {
      userMessage: "JSON 파싱 실패",
      bodyExtra: { ok: false },
    });
  }

  const raw = (body.url ?? "").trim();
  if (!raw) {
    return errorResponse(null, "invalid_input", "[og-extract] url required", 400, undefined, {
      userMessage: "URL 필요",
      bodyExtra: { ok: false },
    });
  }

  // Phase 6-2: SSRF-safe fetch (DNS 해석 + redirect hop 재검증 + size/timeout cap)
  const fetchResult = await safeFetchExternal(raw, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    maxRedirects: 3,
    allowedProtocols: ["https:"], // 주석 명세대로 https 만 (이전 http: 허용은 정정)
    expectedContentType: "text/html",
    headers: {
      "User-Agent": `Mozilla/5.0 (compatible; PibutentenBot/1.0; +${SITE_URL})`,
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!fetchResult.ok) {
    // fetchResult.error 는 외부 fetch 내부 상세(URL/host/timeout 등) — 사용자에 직접 노출 금지.
    // 표준 메시지만 노출, 상세는 server log.
    return errorResponse(
      new Error(fetchResult.error ?? "external fetch failed"),
      "network_failed",
      "[og-extract] safeFetchExternal",
      fetchResult.status >= 400 ? 502 : 400,
      { upstream_status: fetchResult.status },
      {
        userMessage: "외부 페이지를 가져오지 못했어요.",
        bodyExtra: { ok: false },
      },
    );
  }

  const html = new TextDecoder("utf-8").decode(fetchResult.bodyBytes);
  const finalUrl = new URL(fetchResult.finalUrl);
  const title =
    extractMeta(html, "og:title") ?? extractTitle(html) ?? null;
  const description =
    extractMeta(html, "og:description") ??
    extractMeta(html, "description") ??
    null;
  const image = extractMeta(html, "og:image");
  const siteName = extractMeta(html, "og:site_name") ?? finalUrl.hostname;
  const canonical = extractCanonical(html) ?? fetchResult.finalUrl;

  return NextResponse.json({
    ok: true,
    data: { title, description, image, siteName, canonical },
  });
}

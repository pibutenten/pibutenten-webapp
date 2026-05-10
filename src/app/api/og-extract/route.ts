import { NextResponse, type NextRequest } from "next/server";

/**
 * 외부 URL의 Open Graph 메타 추출.
 *
 * POST /api/og-extract  body: { url: string }
 * Response: { ok: true, data: { title, description, image, siteName, canonical } }
 *           | { ok: false, error: string }
 *
 * 사용처: WriteClient에서 사용자가 외부 링크 입력 시 → 카드 자동 생성.
 *
 * 보안:
 *  - https only
 *  - 내부 IP / 로컬호스트 차단 (SSRF 방지)
 *  - timeout 6s
 *  - 응답 크기 1MB 상한
 *
 * 차단 도메인은 추후 environment variable로 관리 (BLOCKED_OG_DOMAINS).
 */

const TIMEOUT_MS = 6000;
const MAX_BYTES = 1024 * 1024; // 1MB
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((p) => p.test(hostname));
}

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
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON 파싱 실패" },
      { status: 400 },
    );
  }

  const raw = (body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "URL 필요" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "올바른 URL 형식이 아닙니다" },
      { status: 400 },
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json(
      { ok: false, error: "https/http URL만 가능" },
      { status: 400 },
    );
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json(
      { ok: false, error: "내부망 호스트는 차단됩니다" },
      { status: 400 },
    );
  }

  // fetch with timeout + size cap
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PibutentenBot/1.0; +https://pibutenten-webapp.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `원격 HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/html")) {
      return NextResponse.json(
        { ok: false, error: "HTML 콘텐츠가 아닙니다" },
        { status: 415 },
      );
    }

    // 응답 크기 제한 — 스트림으로 읽으면서 1MB 초과 시 중단
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { ok: false, error: "응답 본문 없음" },
        { status: 502 },
      );
    }
    const decoder = new TextDecoder("utf-8");
    let html = "";
    let received = 0;
    // 스트림 읽기 — head 닫힘 감지하면 조기 종료 (메타는 head에만 있음)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) {
        await reader.cancel();
        break;
      }
    }

    const title =
      extractMeta(html, "og:title") ?? extractTitle(html) ?? null;
    const description =
      extractMeta(html, "og:description") ??
      extractMeta(html, "description") ??
      null;
    const image = extractMeta(html, "og:image");
    const siteName = extractMeta(html, "og:site_name") ?? parsed.hostname;
    const canonical = extractCanonical(html) ?? parsed.toString();

    return NextResponse.json({
      ok: true,
      data: { title, description, image, siteName, canonical },
    });
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : "네트워크 오류";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 502 },
    );
  }
}

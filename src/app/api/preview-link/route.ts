import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/preview-link
 *
 * 외부 URL → 메타데이터·본문 추출.
 *  - YouTube: oEmbed(제목·채널·썸네일) + 한글 자막 fetch (있으면 우선, 실패해도 OK)
 *  - 일반 기사: og 메타 + Readability 본문 추출 (Readability 실패 시 og.description fallback)
 *
 * 모든 무거운 의존성(jsdom·readability·youtube-transcript)은 dynamic import + try-catch로 격리.
 * outer try-catch로 어떤 케이스에도 JSON 응답 보장.
 */

type PreviewResult = {
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  sourceUrl: string;
  kind: "youtube" | "instagram" | "naverblog" | "web";
};

const FETCH_TIMEOUT_MS = 12000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_BODY_CHARS = 600;

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
      },
      redirect: "follow",
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

function extractMeta(
  html: string,
  key:
    | "og:title"
    | "og:description"
    | "og:image"
    | "og:site_name"
    | "title"
    | "description",
): string {
  if (key === "title") {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return decodeEntities((m?.[1] ?? "").trim());
  }
  const propAttr = key.startsWith("og:") ? "property" : "name";
  const re = new RegExp(
    `<meta[^>]+${propAttr}=["']${key.replace(/:/g, "\\:")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  const c = tag.match(/content=["']([^"']*)["']/i);
  return decodeEntities((c?.[1] ?? "").trim());
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&reg;/g, "®")
    .replace(/&copy;/g, "©")
    .replace(/&trade;/g, "™")
    .replace(/&middot;/g, "·")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function detectKind(u: URL): PreviewResult["kind"] {
  const h = u.hostname.toLowerCase();
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(h)) return "youtube";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (
    /(^|\.)blog\.naver\.com$|(^|\.)m\.blog\.naver\.com$|(^|\.)post\.naver\.com$/.test(
      h,
    )
  )
    return "naverblog";
  return "web";
}

function trimToSentence(text: string, maxChars: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const cuts = [
    sliced.lastIndexOf("다."),
    sliced.lastIndexOf("요."),
    sliced.lastIndexOf("죠."),
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("?"),
    sliced.lastIndexOf("!"),
  ].filter((i) => i > maxChars * 0.5);
  const cutAt = Math.max(...cuts, -1);
  if (cutAt > 0) return sliced.slice(0, cutAt + 1);
  return sliced + "…";
}

async function fetchYoutubeOembed(
  rawUrl: string,
): Promise<{ title: string; channel: string; thumbnail: string | null } | null> {
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
    const r = await fetchWithTimeout(oembed);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: j.title ?? "",
      channel: j.author_name ?? "",
      thumbnail: j.thumbnail_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * YouTube 본문 텍스트 추출.
 *
 * 자막(captionTracks → timedtext)은 2024+ YouTube anti-bot 정책 변경으로
 * 서버 IP에서는 PoToken 없이는 빈 응답만 받음 (youtube-transcript도 동일 이유로 실패).
 *
 * 대신 watch 페이지 HTML의 ytInitialPlayerResponse 내 `shortDescription`을 추출.
 * - 크리에이터가 작성한 정제된 영상 설명
 * - 보통 100~1000자 분량
 * - 해시태그·관련 링크·요약 포함
 *
 * shortDescription이 비어있는 영상(드물게 description 빈칸)은 og:description으로 fallback.
 */
async function safeYoutubeBody(rawUrl: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(rawUrl);
    if (!r.ok) return null;
    const html = await r.text();
    // shortDescription은 JSON 인코딩된 문자열 — \" 와 \n 등 escape 처리됨
    const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (m && m[1]) {
      try {
        const decoded = JSON.parse(`"${m[1]}"`) as string;
        if (typeof decoded === "string" && decoded.trim().length > 0) {
          return decoded;
        }
      } catch {
        /* JSON parse 실패 → og.description fallback */
      }
    }
    // fallback: og:description
    const og = extractMeta(html.slice(0, 80_000), "og:description");
    return og || null;
  } catch {
    return null;
  }
}

/** Readability 본문 추출 — dynamic import + try-catch */
async function safeArticleBody(html: string, url: string): Promise<string> {
  try {
    const [{ JSDOM }, { Readability }] = await Promise.all([
      import("jsdom"),
      import("@mozilla/readability"),
    ]);
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article && article.textContent) return article.textContent;
  } catch {
    /* parse 실패 — 빈 문자열 반환, og.description으로 fallback */
  }
  return "";
}

/**
 * 한국 언론사 CMS 본문 추출 — Readability·정규식 fallback보다 먼저 시도.
 * 대부분의 한국 뉴스 사이트는 표준 selector를 따름:
 *   - id="article-view-content-div" (NeoBoard·메디소비자뉴스 등 다수, 종종 <article> 태그)
 *   - id="articleBodyContents"     (네이버·과거형)
 *   - id="articleBody" / class="article-body" / class="news-content-text"
 *   - itemprop="articleBody"        (Schema.org 표준)
 *
 * HTML이 줄바꿈·여러 공백을 포함할 수 있어 [\s\S] + \s* 사용.
 * 종료 태그는 정확히 매칭하기 어려우므로 시작 태그 위치부터 일정 길이를 잘라
 * 다음 형제 element 직전까지 자른 뒤 텍스트만 추출.
 */
const KOREAN_CMS_ID_PATTERNS: ReadonlyArray<RegExp> = [
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*article-view-content-div\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*articleBodyContents\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*articleBody\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bitemprop\s*=\s*["']\s*articleBody\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\bnews-content-text\b[^"']*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\bview_con\b[^"']*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\barticle-veiw-body\b[^"']*["'][^>]*>/i,
];

function stripToText(snippet: string): string {
  const cleaned = snippet
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, "$& ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(cleaned);
}

function koreanCmsBody(html: string): string {
  for (const startRe of KOREAN_CMS_ID_PATTERNS) {
    const m = startRe.exec(html);
    if (!m) continue;
    const startIdx = m.index + m[0].length;
    // 본문 컨테이너는 보통 5KB ~ 50KB. 안전하게 80KB까지 잘라옴.
    let chunk = html.slice(startIdx, startIdx + 80_000);
    // 본문 끝 표시(다음 형제 요소들) 후로는 잘라냄
    const endMarkers = [
      /<div[^>]+class=["'][^"']*(?:article-copy|article-more|tag-group|relation|article-sns|article-bottom)/i,
      /<aside\b/i,
      /<footer\b/i,
      /<!--\s*\/?\s*article(?:[- ]end|Cont)/i,
    ];
    for (const em of endMarkers) {
      const me = em.exec(chunk);
      if (me) chunk = chunk.slice(0, me.index);
    }
    const text = stripToText(chunk);
    if (text.length >= 80) return text;
  }
  return "";
}

/** 정규식 기반 가벼운 본문 추출 — Korean CMS·Readability 실패 시 보조 */
function regexBodyFallback(html: string): string {
  // <article>·<main>·.article·.entry-content 안의 <p> 태그들 합치기
  const candidate =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html;
  const paragraphs = [...candidate.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()),
    )
    .filter((s) => s.length > 30);
  return paragraphs.join(" ");
}

async function handle(req: Request): Promise<Response> {
  let body: { url?: string } = {};
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "유효하지 않은 요청" }, { status: 400 });
  }
  const raw = (body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "URL이 비어있어요." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json(
      { error: "URL 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json(
      { error: "http/https URL만 지원해요." },
      { status: 400 },
    );
  }

  const kind = detectKind(url);

  // ── YouTube ──
  if (kind === "youtube") {
    const yt = await fetchYoutubeOembed(url.toString());
    let bodyText = "";
    const desc = await safeYoutubeBody(url.toString());
    if (desc) bodyText = trimToSentence(desc, MAX_BODY_CHARS);
    return NextResponse.json({
      title: yt?.title ?? "",
      description: bodyText || (yt?.channel ? `${yt.channel} · YouTube` : ""),
      image: yt?.thumbnail ?? null,
      siteName: "YouTube",
      sourceUrl: url.toString(),
      kind,
    } satisfies PreviewResult);
  }

  // ── 일반 페이지 ──
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString());
  } catch {
    return NextResponse.json(
      { error: "페이지를 불러올 수 없어요." },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `페이지 응답 오류 (${res.status})` },
      { status: 502 },
    );
  }
  const html = await res.text();
  const headHtml = html.slice(0, 80_000);

  const ogTitle = extractMeta(headHtml, "og:title");
  const titleTag = extractMeta(headHtml, "title");
  const ogDesc = extractMeta(headHtml, "og:description");
  const metaDesc = extractMeta(headHtml, "description");
  const ogImage = extractMeta(headHtml, "og:image");
  const ogSiteName = extractMeta(headHtml, "og:site_name");

  // 본문 추출 우선순위:
  //   1) 한국 언론사 CMS selector (article-view-content-div 등)
  //   2) Mozilla Readability
  //   3) 정규식 <article>/<main>/<p>
  //   4) og:description / meta description
  let bestBody = "";
  const cmsBody = koreanCmsBody(html);
  if (cmsBody.length > (ogDesc?.length ?? 0) * 1.2) {
    bestBody = trimToSentence(cmsBody, MAX_BODY_CHARS);
  } else {
    const readabilityBody = await safeArticleBody(html, url.toString());
    if (readabilityBody.length > (ogDesc?.length ?? 0) * 1.2) {
      bestBody = trimToSentence(readabilityBody, MAX_BODY_CHARS);
    } else {
      const regexBody = regexBodyFallback(html);
      if (regexBody.length > (ogDesc?.length ?? 0) * 1.2) {
        bestBody = trimToSentence(regexBody, MAX_BODY_CHARS);
      } else {
        bestBody = ogDesc || metaDesc || "";
      }
    }
  }

  return NextResponse.json({
    title: ogTitle || titleTag || "",
    description: bestBody,
    image: ogImage || null,
    siteName: ogSiteName || url.hostname,
    sourceUrl: url.toString(),
    kind,
  } satisfies PreviewResult);
}

export async function POST(req: Request) {
  // outer try-catch — 어떤 throw도 JSON으로 변환 (HTML 에러 페이지 방지)
  try {
    return await handle(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "내부 오류";
    return NextResponse.json(
      { error: `링크 처리 중 오류: ${msg.slice(0, 120)}` },
      { status: 500 },
    );
  }
}

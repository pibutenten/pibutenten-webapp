import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isHostSafeForExternalFetch } from "@/lib/ssrf-guard";
import { rateLimit } from "@/lib/rate-limit";

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

// Phase 6-2: 6초 단축 (이전 12s → 적대적 대용량 HTML 처리 시 응답 지연 완화)
const FETCH_TIMEOUT_MS = 6000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_BODY_CHARS = 600;
// A6 (2026-05-17): 응답 본문 크기 cap. 일반 블로그 HTML 95% < 1MB. 메타만 필요하므로 2MB 충분.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// 리다이렉트 최대 hop. 모든 hop 마다 host 재검증 적용 (SSRF).
const MAX_REDIRECTS = 3;

/**
 * SSRF-safe fetch — 각 redirect hop 마다 host 재검증.
 *   - `redirect: 'manual'` 로 hop 별 검증 강제 (A6, 2026-05-17).
 *   - 응답 본문 streaming + MAX_BODY_BYTES cap.
 *   - https only.
 *   - https-only 정책으로 MITM 차단.
 *   - 반환: 메모리에 적재된 본문을 가진 합성 Response (caller 가 .arrayBuffer() / .text() 사용 가능).
 */
async function fetchWithTimeout(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(url);
  } catch (e) {
    throw e instanceof Error ? e : new Error("invalid url");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // https only — http 리다이렉트도 차단.
    if (currentUrl.protocol !== "https:") {
      throw new Error(`[preview-link] protocol blocked: ${currentUrl.protocol}`);
    }
    // SSRF — 도메인 → IP 해석 후 사설/메타데이터 차단. hop 마다 재검증.
    const guard = await isHostSafeForExternalFetch(currentUrl.hostname);
    if (!guard.ok) {
      throw new Error(`[preview-link] blocked host: ${guard.reason}`);
    }
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
          ...extraHeaders,
        },
        redirect: "manual",
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(id);
    }
    // 3xx — Location 재검증 후 다음 hop
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error(`[preview-link] redirect without Location: ${res.status}`);
      }
      let next: URL;
      try {
        next = new URL(loc, currentUrl);
      } catch {
        throw new Error("[preview-link] invalid redirect Location");
      }
      currentUrl = next;
      continue;
    }
    // 본문 streaming + cap
    const reader = res.body?.getReader();
    if (!reader) {
      return new Response(new Uint8Array(0), {
        status: res.status,
        headers: res.headers,
      });
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`[preview-link] response exceeds ${MAX_BODY_BYTES} bytes`);
      }
      chunks.push(value);
    }
    const total = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      total.set(c, off);
      off += c.byteLength;
    }
    return new Response(total, {
      status: res.status,
      headers: res.headers,
    });
  }
  throw new Error(`[preview-link] too many redirects (>${MAX_REDIRECTS})`);
}

/**
 * HTML 응답을 올바른 charset으로 디코드.
 *
 * 한국 사이트 일부(조선일보·일부 게시판)는 EUC-KR/CP949로 응답.
 * fetch().text()는 UTF-8을 기본 사용하므로 한글이 깨짐.
 *
 * 우선순위:
 *   1) Content-Type charset
 *   2) HTML <meta charset="…">
 *   3) HTML <meta http-equiv="Content-Type" content="text/html; charset=…">
 *   4) UTF-8 (default)
 */
async function decodeHtmlResponse(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  // 1) header
  let charset = "";
  const ct = res.headers.get("content-type") ?? "";
  const ctMatch = ct.match(/charset\s*=\s*["']?([^"';\s]+)/i);
  if (ctMatch) charset = ctMatch[1];
  // 2)/3) meta — charset 모를 때만 ASCII 부분(처음 4KB)을 latin1으로 읽어 탐색
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    const m1 = head.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i);
    const m2 = head.match(
      /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^"'\s;]+)/i,
    );
    charset = (m1?.[1] ?? m2?.[1] ?? "utf-8").toLowerCase();
  }
  // 알리아스 정규화
  const norm = charset.toLowerCase();
  const decoderName =
    norm === "euc-kr" || norm === "ks_c_5601-1987" || norm === "cp949"
      ? "euc-kr"
      : norm;
  try {
    return new TextDecoder(decoderName, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
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
  // 시작·종료 따옴표 짝 맞춤 — content 값 안에 반대 종류 따옴표가 있어도 OK
  // 예: content="올타이트 개발기업 '○○○', ..." 케이스에서 ' 만나도 안 끊김
  const dq = tag.match(/content="([^"]*)"/i);
  if (dq) return decodeEntities(dq[1].trim());
  const sq = tag.match(/content='([^']*)'/i);
  if (sq) return decodeEntities(sq[1].trim());
  return "";
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
 * 서버 IP에서는 PoToken 없이는 빈 응답만 받음.
 *
 * 대신 watch 페이지 HTML 내 영상 설명을 추출. 데이터센터 IP(Vercel ICN1 등)에서는
 * EU consent screen이 뜰 수 있어 CONSENT cookie를 미리 보내 우회.
 *
 * 추출 우선순위:
 *   1) shortDescription (ytInitialPlayerResponse — 가장 깨끗한 정제 텍스트)
 *   2) videoDetails 안의 shortDescription (다른 JSON 위치)
 *   3) og:description (consent 페이지 아니면 거의 항상 존재)
 *   4) description meta (Twitter card 등)
 */
/**
 * YouTube videoId 추출.
 */
function youtubeVideoIdFrom(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0];
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(?:embed|shorts|v|live)\/([^/?#]+)/);
    if (m) return m[1];
  } catch {
    /* invalid url */
  }
  return null;
}

/**
 * YouTube Innertube /player API 호출 — videoDetails.shortDescription 직접 가져오기.
 *
 * 이 endpoint는 YouTube 웹/모바일 클라이언트가 내부적으로 사용. PoToken 없이도
 * 기본 메타데이터(제목·설명·작성자·길이)는 정상 반환. HTML scrape보다 훨씬 안정적이며
 * 데이터센터 IP에서도 작동.
 */
async function fetchYoutubeInnertube(
  videoId: string,
): Promise<{
  title: string;
  description: string;
  author: string;
  thumbnail: string | null;
} | null> {
  try {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": "2.20250428.00.00",
            "User-Agent": UA,
            Origin: "https://www.youtube.com",
            Referer: `https://www.youtube.com/watch?v=${videoId}`,
          },
          signal: ctl.signal,
          body: JSON.stringify({
            videoId,
            context: {
              client: {
                clientName: "WEB",
                clientVersion: "2.20250428.00.00",
                hl: "ko",
                gl: "KR",
              },
            },
          }),
        },
      );
      if (!r.ok) return null;
      const j = (await r.json()) as {
        videoDetails?: {
          title?: string;
          shortDescription?: string;
          author?: string;
          thumbnail?: { thumbnails?: Array<{ url?: string }> };
        };
        playabilityStatus?: { status?: string };
      };
      const vd = j.videoDetails;
      if (!vd) return null;
      const thumbs = vd.thumbnail?.thumbnails ?? [];
      const lastThumb = thumbs[thumbs.length - 1]?.url ?? null;
      return {
        title: vd.title ?? "",
        description: vd.shortDescription ?? "",
        author: vd.author ?? "",
        thumbnail: lastThumb,
      };
    } finally {
      clearTimeout(id);
    }
  } catch {
    return null;
  }
}

/**
 * YouTube URL을 desktop·mobile 두 가지로 fetch 시도. 데이터센터 IP에서는
 * 둘 중 하나가 더 깨끗한 응답을 주는 경우가 있어 둘 다 시도.
 */
async function fetchYoutubePage(rawUrl: string): Promise<string | null> {
  const urls = [
    rawUrl,
    rawUrl.replace("://www.youtube.com/", "://m.youtube.com/"),
  ];
  const cookieHeader =
    "CONSENT=YES+cb.20210328-17-p0.en+FX+999; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwNTE0LjA3X3AwGgJrbyAEGgYIgIPPwgY; PREF=hl=ko&gl=KR";
  // mobile UA — m.youtube.com은 모바일 UA로 받아야 정상
  const mobileUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetchWithTimeout(
        urls[i],
        i === 0
          ? {
              Cookie: cookieHeader,
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
            }
          : {
              Cookie: cookieHeader,
              "User-Agent": mobileUA,
            },
      );
      if (!r.ok) continue;
      const html = await decodeHtmlResponse(r);
      if (html.length > 1000) return html;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function safeYoutubeBody(rawUrl: string): Promise<string | null> {
  try {
    const html = await fetchYoutubePage(rawUrl);
    if (!html) return null;

    // 패턴 1: shortDescription (가장 깨끗)
    const m1 = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (m1 && m1[1]) {
      try {
        const decoded = JSON.parse(`"${m1[1]}"`) as string;
        if (typeof decoded === "string" && decoded.trim().length > 0) {
          return decoded;
        }
      } catch {
        /* fall through */
      }
    }

    // 패턴 2: videoDetails 객체 안의 shortDescription
    const m2 = html.match(
      /"videoDetails"\s*:\s*\{[^}]*?"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/,
    );
    if (m2 && m2[1]) {
      try {
        const decoded = JSON.parse(`"${m2[1]}"`) as string;
        if (typeof decoded === "string" && decoded.trim().length > 0) {
          return decoded;
        }
      } catch {
        /* fall through */
      }
    }

    // 패턴 3: og:description / description meta — consent 페이지 아니면 항상 있음
    const head = html.slice(0, 80_000);
    const og = extractMeta(head, "og:description");
    if (og && og.trim().length > 0) return og;
    const md = extractMeta(head, "description");
    if (md && md.trim().length > 0) return md;

    // 패턴 4: itemprop="description" content="…"
    const ip = head.match(
      /<meta[^>]+itemprop=["']description["'][^>]*content=["']([^"']*)["']/i,
    );
    if (ip && ip[1] && ip[1].trim().length > 0) return ip[1];

    return null;
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
  // 메디소비자뉴스·NeoBoard 계열
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*article-view-content-div\s*["'][^>]*>/i,
  // 네이버 뉴스 (n.news.naver.com)
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*dic_area\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*newsct_article\s*["'][^>]*>/i,
  // 조선일보·헬스조선
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*news_body_id\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*news_body\s*["'][^>]*>/i,
  // 네이버 모바일 뉴스 / 다음 뉴스
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\b_article_body\b[^"']*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\barticle_view\b[^"']*["'][^>]*>/i,
  // 옛 네이버
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*articleBodyContents\s*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bid\s*=\s*["']\s*articleBody\s*["'][^>]*>/i,
  // Schema.org
  /<(?:div|article|section)\b[^>]*\bitemprop\s*=\s*["']\s*articleBody\s*["'][^>]*>/i,
  // 기타 한국 언론사
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\bnews-content-text\b[^"']*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\bview_con\b[^"']*["'][^>]*>/i,
  /<(?:div|article|section)\b[^>]*\bclass\s*=\s*["'][^"']*\barticle-veiw-body\b[^"']*["'][^>]*>/i,
];

/**
 * 본문에서 항상 제거해야 할 텍스트 패턴 — HTML cut markers로 잡히지 않을 때 마지막 정리.
 * (네이버 뉴스 dic_area처럼 reporter byline·copyright·section navigation이 본문 div 안에 섞여있을 때.)
 *
 * 안전 원칙: 본문 시작부에 우연히 나올 수 있는 일반 단어("구독", "기사 섹션") 사용 금지.
 * 명확한 footer 시그니처만 cut marker로 사용. 본문 길이가 100자 미만이면 cut도 적용 안 함
 * (잘못 매칭되어 전체가 사라지는 사고 방지).
 */
function trimNoiseTextTail(text: string): string {
  if (text.length < 100) return text;
  const noiseRes = [
    // "최예슬 기자(email@xxx)" — email format으로만 매칭
    /\s+[가-힣]{2,5}\s*기자\s*\([^)]{2,40}@[^)]+\)/,
    // 저작권 표기 — Copyright/저작권자 + ⓒ/©
    /Copyright\s*[ⓒ©]/i,
    /저작권자\s*[ⓒ©]/,
    /무단\s*전재\s*및\s*재배포/,
  ];
  let cutAt = text.length;
  for (const re of noiseRes) {
    const m = re.exec(text);
    // cut 위치가 너무 앞이면 (본문 50자 미만에서 cut되면) 무시 — 오작동 방지
    if (m && m.index >= 50 && m.index < cutAt) cutAt = m.index;
  }
  return text.slice(0, cutAt).trim();
}

function stripToText(snippet: string): string {
  const cleaned = snippet
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    // 본문 안 광고 블록 — class="ad-…"·"ad_…"·id="AD…"
    .replace(
      /<div[^>]*\b(?:class\s*=\s*["'][^"']*\b(?:ad[-_])[^"']*["']|id\s*=\s*["']AD[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    // iframe (광고·동영상) — 본문에 텍스트 기여 없음
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    // 네이버 뉴스 chrome — 기자 프로필·구독·관련 기사 (본문 div 안에 위치)
    .replace(
      /<(?:div|section|article)[^>]*\bclass\s*=\s*["'][^"']*\b(?:_article_journalist|reporter|byline|article_footer|publisher|copyright|cmt|news_end|sub_info|press_info|nbd_table_news)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|article)>/gi,
      "",
    )
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, "$& ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return trimNoiseTextTail(decodeEntities(cleaned));
}

function koreanCmsBody(html: string): string {
  for (const startRe of KOREAN_CMS_ID_PATTERNS) {
    const m = startRe.exec(html);
    if (!m) continue;
    const startIdx = m.index + m[0].length;
    // 본문 컨테이너는 보통 5KB ~ 50KB. 안전하게 80KB까지 잘라옴.
    let chunk = html.slice(startIdx, startIdx + 80_000);
    // 본문 끝 표시(다음 형제 요소들) 후로는 잘라냄.
    // 한국 언론사 CMS는 본문 직후 다음 블록들이 옴 — 모두 본문이 아니므로 제거:
    //   - <article class="writer">  : 기자 바이라인 + 이메일 + "기자의 다른기사"
    //   - <article class="article-copy">: 저작권자 © ... 무단전재 및 재배포 금지
    //   - <ul class="tag-group">    : 본문 태그 리스트
    //   - 댓글 섹션 (#comment-area, .comment-area, etc.)
    //   - 관련 기사 (.relation), 광고 (.ad-...)
    // 본문 안에 인라인 광고(class="ad-template" 등)가 있을 수 있어 광고는 cut marker가 아닌
    // stripToText 단계에서 제거. cut marker는 진짜 본문 종료 표식만.
    const endMarkers = [
      /<(?:div|article|section|ul)[^>]*\bclass\s*=\s*["'][^"']*\b(?:article-copy|article-more|article-sns|article-bottom|writer|tag-group|relation)\b[^"']*["']/i,
      /<(?:div|article|section)[^>]*\bid\s*=\s*["'](?:comment|comment-area|cmtBody|cmtContent|article-bottom)/i,
      /<footer\b/i,
      /<!--\s*\/?\s*article(?:[- ]end|Cont|-bottom)/i,
      // 명시적 텍스트 마커 (HTML 정리 누락 사이트 대비)
      /저작권자\s*&copy;|저작권자\s*©|무단전재 및 재배포/,
    ];
    let cutAt = chunk.length;
    for (const em of endMarkers) {
      const me = em.exec(chunk);
      if (me && me.index < cutAt) cutAt = me.index;
    }
    chunk = chunk.slice(0, cutAt);
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

/**
 * 네이버 블로그 본문 추출.
 *
 * 네이버 블로그는 frame 구조 — desktop(blog.naver.com)은 outer frame만 와서 본문 비어있음.
 * 두 가지 우회:
 *   1) m.blog.naver.com (모바일) — 프레임 없이 본문 직접 렌더
 *   2) PostView.naver?blogId=X&logNo=Y — frame inner 직접 호출
 *
 * 본문 selector:
 *   - .se-main-container       (Smart Editor 3+, 현 표준)
 *   - #postViewArea            (구 에디터)
 *   - #post-view{logNo}        (PostView.naver)
 */
function parseNaverBlogIds(
  u: URL,
): { blogId: string; logNo: string } | null {
  // /{blogId}/{logNo}
  const seg = u.pathname.split("/").filter(Boolean);
  if (
    seg.length === 2 &&
    /^[A-Za-z0-9_-]+$/.test(seg[0]) &&
    /^\d+$/.test(seg[1])
  ) {
    return { blogId: seg[0], logNo: seg[1] };
  }
  // PostView.naver?blogId=X&logNo=Y
  const blogId = u.searchParams.get("blogId");
  const logNo = u.searchParams.get("logNo");
  if (blogId && logNo) return { blogId, logNo };
  return null;
}

async function safeNaverBlogBody(
  rawUrl: string,
): Promise<{ title: string; body: string; image: string | null } | null> {
  try {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      return null;
    }
    const ids = parseNaverBlogIds(u);
    // postId 없는 블로그 홈페이지(예: blog.naver.com/{blogId}만) — 특정 글이 아니므로
    // 본문 추출 불가. 호출자가 일반 페이지 처리로 fall through 하도록 null.
    if (!ids) {
      // /{blogId} 또는 /{blogId}/ 만 있는 경우
      const seg = u.pathname.split("/").filter(Boolean);
      if (seg.length <= 1) return null;
    }
    // 모바일 URL로 변환 — 프레임 없이 본문 직접 옴
    const mobileUrl = ids
      ? `https://m.blog.naver.com/${ids.blogId}/${ids.logNo}`
      : rawUrl.replace(/^https?:\/\/blog\.naver\.com/, "https://m.blog.naver.com");

    const r = await fetchWithTimeout(mobileUrl);
    if (!r.ok) return null;
    const html = await decodeHtmlResponse(r);

    // 제목·OG
    const head = html.slice(0, 80_000);
    const ogTitle = extractMeta(head, "og:title");
    const ogImage = extractMeta(head, "og:image");
    const titleTag = extractMeta(head, "title");
    const ogDesc = extractMeta(head, "og:description");

    // 본문 selectors — 모바일 페이지 우선순위
    const startPatterns = [
      /<div[^>]*\bclass\s*=\s*["'][^"']*\bse-main-container\b[^"']*["'][^>]*>/i,
      /<div[^>]*\bid\s*=\s*["']postViewArea["'][^>]*>/i,
      /<div[^>]*\bid\s*=\s*["']post-view\d+["'][^>]*>/i,
      /<div[^>]*\bclass\s*=\s*["'][^"']*\bpost_ct\b[^"']*["'][^>]*>/i,
    ];
    let body = "";
    for (const sp of startPatterns) {
      const m = sp.exec(html);
      if (!m) continue;
      const startIdx = m.index + m[0].length;
      const chunk = html.slice(startIdx, startIdx + 80_000);
      // 본문 종료 — 댓글·공감·관련글 영역
      const endRe =
        /<div[^>]*\bclass\s*=\s*["'][^"']*\b(?:btn_post|post_btn|comment|sympathy|relate|toolbar|footer)\b[^"']*["']/i;
      const me = endRe.exec(chunk);
      const sliced = me ? chunk.slice(0, me.index) : chunk;
      const text = stripToText(sliced);
      if (text.length >= 50) {
        body = text;
        break;
      }
    }
    // fallback: og:description (네이버는 보통 og:description 잘 채움)
    if (!body && ogDesc) body = ogDesc;
    if (!body) return null;
    return {
      title: ogTitle || titleTag || "",
      body,
      image: ogImage || null,
    };
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  // Phase 6-2: 인증 필수 (anon DoS / SSRF proxy 방지)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // Rate limit (A8): 사용자당 분당 30회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "preview-link",
    userId: user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

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
  // https only (A6, 2026-05-17) — http 는 MITM 위험 + SSRF 표면 확장.
  // 사용자가 http URL 을 넣으면 자동 promote 후 시도하지 않고 명확히 거부.
  if (url.protocol !== "https:") {
    return NextResponse.json(
      { error: "https URL만 지원해요." },
      { status: 400 },
    );
  }

  const kind = detectKind(url);

  // ── YouTube ──
  // 우선순위: Data API v3 (env에 키 있으면) → Innertube /player → HTML scrape → oEmbed only
  if (kind === "youtube") {
    const videoId = youtubeVideoIdFrom(url.toString());
    let title = "";
    let bodyText = "";
    let image: string | null = null;
    let channel = "";

    // 1) Data API v3 — env에 YOUTUBE_API_KEY 설정되어 있을 때
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (videoId && apiKey) {
      try {
        const r = await fetchWithTimeout(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(
            videoId,
          )}&key=${encodeURIComponent(apiKey)}`,
        );
        if (r.ok) {
          const j = (await r.json()) as {
            items?: Array<{
              snippet?: {
                title?: string;
                description?: string;
                channelTitle?: string;
                thumbnails?: Record<string, { url?: string } | undefined>;
              };
            }>;
          };
          const sn = j.items?.[0]?.snippet;
          if (sn) {
            title = sn.title ?? "";
            bodyText = sn.description ?? "";
            channel = sn.channelTitle ?? "";
            image =
              sn.thumbnails?.maxres?.url ??
              sn.thumbnails?.standard?.url ??
              sn.thumbnails?.high?.url ??
              sn.thumbnails?.medium?.url ??
              sn.thumbnails?.default?.url ??
              null;
          }
        }
      } catch {
        /* fall through */
      }
    }

    // 2) Innertube /player — Data API 미설정/실패 시
    if (!bodyText && videoId) {
      const it = await fetchYoutubeInnertube(videoId);
      if (it) {
        if (!title) title = it.title;
        if (!channel) channel = it.author;
        if (!image) image = it.thumbnail;
        bodyText = it.description;
      }
    }

    // 3) HTML scrape (CONSENT cookie + mobile UA fallback) — Innertube 실패 시
    if (!bodyText) {
      const desc = await safeYoutubeBody(url.toString());
      if (desc) bodyText = desc;
    }

    // 4) oEmbed — title/channel/thumbnail 보강
    if (!title || !image) {
      const yt = await fetchYoutubeOembed(url.toString());
      if (yt) {
        if (!title) title = yt.title;
        if (!channel) channel = yt.channel;
        if (!image) image = yt.thumbnail;
      }
    }

    return NextResponse.json({
      title,
      description:
        trimToSentence(bodyText, MAX_BODY_CHARS) ||
        (channel ? `${channel} · YouTube` : ""),
      image,
      siteName: "YouTube",
      sourceUrl: url.toString(),
      kind,
    } satisfies PreviewResult);
  }

  // ── 네이버 블로그 ── (frame 구조이므로 모바일 URL로 우회)
  if (kind === "naverblog") {
    const nv = await safeNaverBlogBody(url.toString());
    if (nv) {
      return NextResponse.json({
        title: nv.title,
        description: trimToSentence(nv.body, MAX_BODY_CHARS),
        image: nv.image,
        siteName: "네이버 블로그",
        sourceUrl: url.toString(),
        kind,
      } satisfies PreviewResult);
    }
    // safeNaverBlogBody 실패 시 일반 페이지 처리로 fall through (적어도 og 태그는 잡힘)
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
  const html = await decodeHtmlResponse(res);
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

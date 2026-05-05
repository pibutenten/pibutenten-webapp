/**
 * YouTube 자막 fetch 유틸.
 *
 * 1) URL → videoId 추출 (watch / youtu.be / shorts 모두 지원)
 * 2) `youtube-transcript` 패키지로 한국어 자막 시도 → 실패 시 영어 → 실패 시 default
 * 3) 영상 제목은 oEmbed (https://www.youtube.com/oembed) 로 가볍게 가져옴 (실패 시 null)
 *
 * 외부 의존 안정성을 위해 youtube-transcript 가 throw 하면 직접 timedtext API 호출로 fallback.
 */

import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeTranscriptResult = {
  videoId: string;
  title: string | null;
  transcript: string;
};

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** 다양한 YouTube URL 형태에서 11자 videoId 를 추출. 실패 시 throw. */
export function extractVideoId(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("URL is empty");

  // 이미 videoId 만 들어온 경우
  if (YOUTUBE_ID_REGEX.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  const host = url.hostname.replace(/^www\./, "");

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && YOUTUBE_ID_REGEX.test(id)) return id;
  }

  // youtube.com/watch?v=<id>
  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_REGEX.test(v)) return v;

    // /shorts/<id>, /embed/<id>, /live/<id>
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const candidate = segments[1];
      if (YOUTUBE_ID_REGEX.test(candidate)) return candidate;
    }
  }

  throw new Error(`Could not extract videoId from URL: ${raw}`);
}

/** YouTube oEmbed 로 영상 제목을 best-effort 로 가져옴. 실패하면 null. */
async function fetchTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: string };
    return json.title?.trim() || null;
  } catch {
    return null;
  }
}

/** youtube-transcript 패키지로 자막 시도. lang 명시 시 해당 언어 우선. */
async function fetchViaPackage(videoId: string, lang?: string): Promise<string> {
  const items = await YoutubeTranscript.fetchTranscript(
    videoId,
    lang ? { lang } : undefined,
  );
  if (!items?.length) throw new Error("empty transcript items");
  return items
    .map((it) => decodeHtml(it.text).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

/** 단순 HTML entity 디코딩 (자막에 자주 등장: &amp; &#39; 등). */
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** timedtext API fallback (XML). lang 미지정 시 default 트랙. */
async function fetchViaTimedText(videoId: string, lang?: string): Promise<string> {
  const params = new URLSearchParams({ v: videoId });
  if (lang) params.set("lang", lang);
  const res = await fetch(`https://www.youtube.com/api/timedtext?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`timedtext HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.trim()) throw new Error("timedtext empty body");
  // <text ...>본문</text> 패턴만 본문 추출
  const matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
  if (!matches?.length) throw new Error("no <text> nodes");
  const parts = matches
    .map((m) => m.replace(/<text[^>]*>/, "").replace(/<\/text>$/, ""))
    .map((t) => decodeHtml(t).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("timedtext empty after parse");
  return parts.join(" ");
}

/** 한국어 → 영어 → default 순으로 시도. 패키지 실패 시 timedtext fallback. */
async function fetchTranscriptResilient(videoId: string): Promise<string> {
  const attempts: Array<() => Promise<string>> = [
    () => fetchViaPackage(videoId, "ko"),
    () => fetchViaPackage(videoId, "en"),
    () => fetchViaPackage(videoId),
    () => fetchViaTimedText(videoId, "ko"),
    () => fetchViaTimedText(videoId, "en"),
    () => fetchViaTimedText(videoId),
  ];

  const errors: string[] = [];
  for (const run of attempts) {
    try {
      const text = (await run()).trim();
      if (text.length >= 20) return text;
      errors.push("too short");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(`Failed to fetch transcript for ${videoId}: ${errors.join(" | ")}`);
}

/**
 * YouTube URL/ID → 자막 + 제목 fetch.
 * @throws videoId 추출 실패, 모든 자막 트랙 fetch 실패 시
 */
export async function fetchYoutubeTranscript(input: string): Promise<YoutubeTranscriptResult> {
  const videoId = extractVideoId(input);
  const [transcript, title] = await Promise.all([
    fetchTranscriptResilient(videoId),
    fetchTitle(videoId),
  ]);
  return { videoId, title, transcript };
}

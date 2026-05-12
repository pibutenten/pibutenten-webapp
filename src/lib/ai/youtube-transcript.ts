/**
 * YouTube 자막 fetch 유틸 (Phase 8 — v2).
 *
 * 동작:
 *  1) URL → videoId 추출 (watch / youtu.be / shorts / embed / live)
 *  2) 한국어 **수동 자막** 우선 → 실패 시 한국어 **자동자막** → 실패 시 영어 → default
 *     - youtube-transcript 패키지 + timedtext API fallback
 *  3) 영상 제목·업로드일은 oEmbed로 best-effort
 *
 * 자막을 어느 트랙에서도 못 가져오면 명확한 한국어 메시지로 throw.
 */

import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeTranscriptResult = {
  videoId: string;
  title: string | null;
  /** 자막 본문 — 자막 줄들 공백으로 합친 plain text */
  transcript: string;
  /** 어느 트랙에서 가져왔는지 (디버깅·UI 표시용) */
  source: "ko-manual" | "ko-auto" | "en" | "default" | "unknown";
  /** ISO 날짜 (YYYY-MM-DD) 또는 null — oEmbed에는 업로드일이 없음 */
  uploadDate: string | null;
};

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** 다양한 YouTube URL 형태에서 11자 videoId 를 추출. 실패 시 throw. */
export function extractVideoId(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("URL is empty");
  if (YOUTUBE_ID_REGEX.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && YOUTUBE_ID_REGEX.test(id)) return id;
  }
  if (host.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_REGEX.test(v)) return v;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const candidate = segments[1];
      if (YOUTUBE_ID_REGEX.test(candidate)) return candidate;
    }
  }
  throw new Error(`Could not extract videoId from URL: ${raw}`);
}

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

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    );
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

/** timedtext API fallback. kind='asr'이면 자동자막 직접 호출 (수동 자막은 kind 생략). */
async function fetchViaTimedText(
  videoId: string,
  opts: { lang?: string; kind?: "asr" } = {},
): Promise<string> {
  const params = new URLSearchParams({ v: videoId });
  if (opts.lang) params.set("lang", opts.lang);
  if (opts.kind) params.set("kind", opts.kind);
  const res = await fetch(
    `https://www.youtube.com/api/timedtext?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`timedtext HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.trim()) throw new Error("timedtext empty body");
  const matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
  if (!matches?.length) throw new Error("no <text> nodes");
  const parts = matches
    .map((m) => m.replace(/<text[^>]*>/, "").replace(/<\/text>$/, ""))
    .map((t) => decodeHtml(t).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("timedtext empty after parse");
  return parts.join(" ");
}

/**
 * 자막 트랙 시도 순서 (한국어 수동 → 자동 → 영어 → default):
 */
async function fetchTranscriptResilient(videoId: string): Promise<{
  text: string;
  source: YoutubeTranscriptResult["source"];
}> {
  const attempts: Array<{
    label: YoutubeTranscriptResult["source"];
    run: () => Promise<string>;
  }> = [
    { label: "ko-manual", run: () => fetchViaTimedText(videoId, { lang: "ko" }) },
    { label: "ko-manual", run: () => fetchViaPackage(videoId, "ko") },
    { label: "ko-auto", run: () => fetchViaTimedText(videoId, { lang: "ko", kind: "asr" }) },
    { label: "en", run: () => fetchViaTimedText(videoId, { lang: "en" }) },
    { label: "en", run: () => fetchViaPackage(videoId, "en") },
    { label: "default", run: () => fetchViaTimedText(videoId) },
    { label: "default", run: () => fetchViaPackage(videoId) },
  ];

  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const text = (await a.run()).trim();
      if (text.length >= 20) {
        return { text, source: a.label };
      }
      errors.push(`${a.label}: too short`);
    } catch (e) {
      errors.push(`${a.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `이 영상에는 한국어 자막이 없어 Q&A를 추출할 수 없습니다. (시도: ${errors.join(" | ")})`,
  );
}

/**
 * YouTube URL/ID → 자막 + 제목 fetch.
 * @throws videoId 추출 실패, 모든 자막 트랙 fetch 실패 시
 */
export async function fetchYoutubeTranscript(
  input: string,
): Promise<YoutubeTranscriptResult> {
  const videoId = extractVideoId(input);
  const [{ text, source }, title] = await Promise.all([
    fetchTranscriptResilient(videoId),
    fetchTitle(videoId),
  ]);
  return { videoId, title, transcript: text, source, uploadDate: null };
}

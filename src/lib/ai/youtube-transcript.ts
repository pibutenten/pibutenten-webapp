/**
 * YouTube 자막 fetch 유틸 (Phase 8 — v3).
 *
 * 동작 (다층 fallback):
 *   1) watch 페이지 HTML의 `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks`
 *      파싱 → 한국어 트랙(수동 우선) baseUrl로 직접 자막 fetch. 가장 안정적.
 *   2) youtube-transcript 패키지 (ko 우선)
 *   3) timedtext API (수동 ko → 자동 ko → en → default)
 *
 * 둘 다 실패 시 명확한 한국어 메시지로 throw.
 *
 * v3 변경: watch 페이지 파싱 추가 (youtube-transcript / timedtext가 "Transcript is
 * disabled" 또는 empty body로 실패하는 영상도 처리 가능).
 */

import { YoutubeTranscript } from "youtube-transcript";
import { fetchCaptionsViaOauth, isOauthAvailable } from "./youtube-oauth";
import {
  fetchTranscriptViaPython,
  isPythonTranscriptAvailable,
} from "./python-transcript";

export type YoutubeTranscriptResult = {
  videoId: string;
  title: string | null;
  transcript: string;
  source: "ko-manual" | "ko-auto" | "en" | "default" | "unknown";
  uploadDate: string | null;
};

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

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

/** 자막 XML → 합쳐진 plain text. <text>·<p> 모두 대응 */
function parseCaptionXml(xml: string): string {
  let matches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
  if (!matches || matches.length === 0) {
    matches = xml.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
  }
  if (!matches || matches.length === 0) throw new Error("no <text>/<p> nodes");
  const parts = matches
    .map((m) =>
      m.replace(/<text[^>]*>/, "").replace(/<\/text>$/, "")
        .replace(/<p[^>]*>/, "").replace(/<\/p>$/, ""),
    )
    .map((t) => decodeHtml(t.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("caption XML empty after parse");
  return parts.join(" ");
}

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = 자동자막
  name?: { simpleText?: string };
};

/**
 * watch 페이지 HTML에서 ytInitialPlayerResponse → captionTracks 추출.
 *
 * youtube-transcript / timedtext API가 실패하는 영상도 이 경로로 자막 fetch 가능.
 * (이 API들은 YouTube의 인증·봇 탐지에 자주 막힘)
 */
async function fetchCaptionTracksFromWatch(
  videoId: string,
): Promise<CaptionTrack[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`watch page HTTP ${res.status}`);
  const html = await res.text();

  // ytInitialPlayerResponse 추출 — 여러 패턴 시도
  const patterns = [
    /var\s+ytInitialPlayerResponse\s*=\s*({[\s\S]+?})\s*;\s*(?:var|<\/script>)/,
    /ytInitialPlayerResponse\s*=\s*({[\s\S]+?})\s*;\s*(?:var|<\/script>)/,
  ];
  let playerResponse: unknown = null;
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      try {
        playerResponse = JSON.parse(m[1]);
        break;
      } catch {
        /* try next */
      }
    }
  }
  if (!playerResponse || typeof playerResponse !== "object") {
    throw new Error("ytInitialPlayerResponse not found");
  }
  const pr = playerResponse as {
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };
  const tracks =
    pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error("captionTracks empty");
  return tracks;
}

async function fetchCaptionByTrack(track: CaptionTrack): Promise<string> {
  if (!track.baseUrl) throw new Error("track has no baseUrl");
  const res = await fetch(track.baseUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`track baseUrl HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.trim()) throw new Error("track empty body");
  return parseCaptionXml(xml);
}

/** youtube-transcript 패키지 fallback */
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

/** timedtext API fallback */
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
  return parseCaptionXml(xml);
}

/**
 * 자막 시도 — 가장 안정적인 watch 페이지 파싱부터, fallback으로 패키지·timedtext.
 *
 * 트랙 우선순위:
 *   1) 한국어 수동
 *   2) 한국어 자동(asr)
 *   3) 영어 수동
 *   4) 어떤 수동 트랙이든
 *   5) 어떤 트랙이든
 */
async function fetchTranscriptResilient(videoId: string): Promise<{
  text: string;
  source: YoutubeTranscriptResult["source"];
}> {
  const errors: string[] = [];

  // 0a) Python `youtube-transcript-api` (외부 채널 영상도 잡힘 — 가장 안정적)
  if (isPythonTranscriptAvailable()) {
    try {
      const r = await fetchTranscriptViaPython(videoId);
      if (r && r.text.length >= 20) {
        return { text: r.text, source: r.source };
      }
      if (!r) errors.push("python: no transcript");
    } catch (e) {
      errors.push(`python: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 0b) YouTube Data API v3 OAuth (본인 채널 — 둘째 안정적)
  if (await isOauthAvailable()) {
    try {
      const r = await fetchCaptionsViaOauth(videoId);
      if (r && r.text.length >= 20) {
        return { text: r.text, source: r.source };
      }
      if (!r) errors.push("oauth: no caption / 403 / not own channel");
    } catch (e) {
      errors.push(`oauth: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 1) watch 페이지 → captionTracks 분석
  try {
    const tracks = await fetchCaptionTracksFromWatch(videoId);

    const findKo = (asr: boolean) =>
      tracks.find(
        (t) =>
          t.languageCode === "ko" &&
          (asr ? t.kind === "asr" : t.kind !== "asr"),
      );
    const koManual = findKo(false);
    const koAuto = findKo(true);
    const enManual = tracks.find(
      (t) => t.languageCode === "en" && t.kind !== "asr",
    );
    const anyManual = tracks.find((t) => t.kind !== "asr");
    const any = tracks[0];

    const order: Array<{
      label: YoutubeTranscriptResult["source"];
      track?: CaptionTrack;
    }> = [
      { label: "ko-manual", track: koManual },
      { label: "ko-auto", track: koAuto },
      { label: "en", track: enManual },
      { label: "default", track: anyManual },
      { label: "default", track: any },
    ];
    for (const o of order) {
      if (!o.track) continue;
      try {
        const text = (await fetchCaptionByTrack(o.track)).trim();
        if (text.length >= 20) {
          return { text, source: o.label };
        }
        errors.push(`watch:${o.label}:${o.track.languageCode}:too short`);
      } catch (e) {
        errors.push(
          `watch:${o.label}:${o.track.languageCode}:${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  } catch (e) {
    errors.push(`watch page: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) youtube-transcript 패키지 + timedtext API (백업)
  const attempts: Array<{
    label: YoutubeTranscriptResult["source"];
    run: () => Promise<string>;
  }> = [
    { label: "ko-manual", run: () => fetchViaPackage(videoId, "ko") },
    { label: "ko-manual", run: () => fetchViaTimedText(videoId, { lang: "ko" }) },
    { label: "ko-auto", run: () => fetchViaTimedText(videoId, { lang: "ko", kind: "asr" }) },
    { label: "en", run: () => fetchViaPackage(videoId, "en") },
    { label: "en", run: () => fetchViaTimedText(videoId, { lang: "en" }) },
    { label: "default", run: () => fetchViaPackage(videoId) },
    { label: "default", run: () => fetchViaTimedText(videoId) },
  ];
  for (const a of attempts) {
    try {
      const text = (await a.run()).trim();
      if (text.length >= 20) return { text, source: a.label };
      errors.push(`${a.label}:too short`);
    } catch (e) {
      errors.push(`${a.label}:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(
    `이 영상에는 한국어 자막이 없어 Q&A를 추출할 수 없습니다. (시도: ${errors.join(" | ")})`,
  );
}

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

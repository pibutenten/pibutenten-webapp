/**
 * YouTube 영상 게시일(upload_date) 추출 유틸.
 *
 * 배경: 과거엔 YouTube Data API(OAuth)로 메타를 가져왔으나 OAuth refresh_token 이
 * 만료(invalid_grant)되어 더는 못 씁니다. 대신 영상 watch 페이지의 메타 태그에서
 * 게시일을 추출합니다.
 *
 * 동작:
 *   - watch 페이지 HTML 에서 `"uploadDate":"<ISO>"` 또는 `"publishDate":"<ISO>"` 의
 *     첫 매치를 찾아 한국시간(Asia/Seoul) 기준 날짜(YYYY-MM-DD)로 변환.
 *   - 기존 DB의 upload_date 가 모두 "게시시각의 KST 변환 날짜" 기준이므로 동일하게 맞춤.
 *   - 어떤 실패(네트워크 오류/매치 없음/파싱 오류)에도 throw 하지 않고 null 반환.
 *     실패는 console.warn 으로만 기록 (발행 자체를 절대 막지 않기 위해).
 *   - 11자 유튜브ID 형식이 아니면 fetch 시도 없이 즉시 null 반환.
 */

/** 유튜브 video ID 형식: 11자 [A-Za-z0-9_-]. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** watch 페이지 fetch 타임아웃 (R2-3, 2026-07-04) — YouTube 무응답 시 발행 요청이
 *  무기한 대기하지 않도록. 타임아웃(AbortError)도 기존 catch → null 경로로 합류. */
const FETCH_TIMEOUT_MS = 10_000;

/** watch 페이지 HTML 에서 게시일 ISO timestamp 를 뽑는 정규식 (uploadDate 우선, publishDate fallback). */
const UPLOAD_DATE_RE = /"uploadDate":"([^"]+)"/;
const PUBLISH_DATE_RE = /"publishDate":"([^"]+)"/;

/**
 * 주어진 videoId 의 영상 게시일을 한국시간(Asia/Seoul) 기준 YYYY-MM-DD 로 반환.
 * 실패 시 null (throw 하지 않음).
 */
export async function fetchYoutubeUploadDateKst(
  videoId: string,
): Promise<string | null> {
  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Cookie: "CONSENT=YES+cb",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[youtube-upload-date] fetch non-ok status=${res.status} video=${videoId}`,
      );
      return null;
    }
    const html = await res.text();

    const iso =
      html.match(UPLOAD_DATE_RE)?.[1] ?? html.match(PUBLISH_DATE_RE)?.[1] ?? null;
    if (!iso) {
      console.warn(`[youtube-upload-date] no date match video=${videoId}`);
      return null;
    }

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      console.warn(
        `[youtube-upload-date] unparseable iso="${iso}" video=${videoId}`,
      );
      return null;
    }

    // ISO timestamp 를 Asia/Seoul 기준 YYYY-MM-DD 로 변환.
    // en-CA 로케일은 YYYY-MM-DD 포맷을 보장.
    const kstDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

    return kstDate;
  } catch (e) {
    console.warn(`[youtube-upload-date] fetch/parse error video=${videoId}`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

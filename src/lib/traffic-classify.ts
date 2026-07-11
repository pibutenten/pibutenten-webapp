/**
 * 유입 분석 분류 헬퍼 (서버 전용 — /api/landing 에서 사용).
 *
 * referrer 도메인 + 인앱 UA + UTM 으로 채널을 분류하고, UA 에서 기기/OS/인앱을 파싱한다.
 * "무슨 검색어로 찾았는지"(오가닉 검색어)는 검색엔진이 referrer 로 안 넘겨 여기서 알 수 없다
 * (Google Search Console / 네이버 서치어드바이저 전용 — 이 모듈 범위 밖).
 */

export type Channel =
  | "search_google"
  | "search_naver"
  | "search_daum"
  | "search_bing"
  | "social_instagram"
  | "social_youtube"
  | "social_facebook"
  | "social_x"
  | "social_threads"
  | "messenger_kakao"
  | "messenger_line"
  | "referral"
  | "direct"
  | "app"
  | "internal";

/** referrer 문자열 → host(소문자, www 제거). 파싱 실패/빈 값이면 null. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** UA → 인앱 브라우저 종류(없으면 null). InAppBrowserNotice 와 동일 시그니처. */
export function detectInApp(ua: string): string | null {
  const u = ua.toLowerCase();
  if (u.includes("kakaotalk")) return "kakaotalk";
  if (u.includes("instagram")) return "instagram";
  if (u.includes("fban") || u.includes("fbav")) return "facebook";
  if (u.includes("naver(inapp")) return "naver";
  if (u.includes("line/")) return "line";
  return null;
}

/** UA → 기기 구분. */
export function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  const u = ua.toLowerCase();
  // 태블릿: iPad/명시적 tablet, 또는 Android 인데 'mobile' 토큰 없음(안드 태블릿 관례).
  if (/ipad|tablet/.test(u) || (u.includes("android") && !u.includes("mobile"))) return "tablet";
  if (/mobile|iphone|ipod|android/.test(u)) return "mobile";
  return "desktop";
}

/** UA → OS 구분. */
export function detectOs(ua: string): "ios" | "android" | "windows" | "macos" | "other" {
  const u = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  if (/windows/.test(u)) return "windows";
  if (/mac os x|macintosh/.test(u)) return "macos";
  return "other";
}

const OWN_HOSTS = ["pibutenten.kr", "pibutenten.com", "pbtt.kr"];

/**
 * 채널 분류 — 우선순위: 인앱 UA > referrer 도메인 > UTM > 직접.
 *  - inApp: 카톡/인스타 인앱은 referrer 가 비어도 UA 로 출처 확정.
 *  - referrer 없음 + UTM 없음 + 인앱 아님 = 직접(direct, 즐겨찾기·주소 입력·앱 등).
 */
export function classifyChannel(opts: {
  host: string | null;
  inApp: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
}): Channel {
  const { host, inApp, utmSource, utmMedium } = opts;

  // 1) 인앱 UA 우선(referrer 비어도 확정)
  if (inApp === "kakaotalk") return "messenger_kakao";
  if (inApp === "line") return "messenger_line";
  if (inApp === "instagram") return "social_instagram";
  if (inApp === "facebook") return "social_facebook";
  if (inApp === "naver") return "search_naver"; // 네이버 앱 인앱 = 네이버 유입으로 취급

  // 2) referrer 도메인
  if (host) {
    if (OWN_HOSTS.some((h) => host === h || host.endsWith("." + h))) return "internal";
    if (host.includes("google.")) return "search_google";
    if (host.includes("naver.")) return "search_naver";
    if (host.includes("bing.")) return "search_bing";
    // 카카오: 검색(search.kakao.com=다음 계열)과 메신저(공유/톡/계정)를 구분 —
    //   'kakao' 광의 매칭을 daum 보다 뒤·검색 예외 뒤에 둬야 오분류 없음(code-review W-1).
    if (host === "search.kakao.com") return "search_daum";
    if (host.includes("daum.")) return "search_daum";
    if (host.includes("instagram.")) return "social_instagram";
    if (host.includes("youtube.") || host.includes("youtu.be")) return "social_youtube";
    if (host.includes("facebook.") || host === "fb.com" || host.includes("l.facebook"))
      return "social_facebook";
    if (host === "t.co" || host.includes("twitter.") || host === "x.com")
      return "social_x";
    if (host.includes("threads.")) return "social_threads";
    if (host.includes("kakao")) return "messenger_kakao"; // 그 외 카카오 = 메신저(공유/톡/계정)
    if (host.includes("line.me")) return "messenger_line";
    return "referral";
  }

  // 3) UTM (referrer 없지만 캠페인 링크로 진입)
  const s = (utmSource ?? "").toLowerCase();
  if (s) {
    if (s.includes("google")) return "search_google";
    if (s.includes("naver")) return "search_naver";
    if (s.includes("insta")) return "social_instagram";
    if (s.includes("youtube")) return "social_youtube";
    if (s.includes("facebook") || s === "fb") return "social_facebook";
    if (s.includes("kakao")) return "messenger_kakao";
    if ((utmMedium ?? "").toLowerCase() === "app") return "app";
    return "referral";
  }

  // 4) 직접
  return "direct";
}

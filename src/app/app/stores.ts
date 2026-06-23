/**
 * 앱 스토어 URL 상수 (단일 출처).
 *
 *  - iOS: App Store ID `6781289580` (경로형 — 한국 스토어 `/kr/`)
 *  - Android: Play 스토어 표준 형식 `?id=<package_name>` (패키지 = 번들 ID)
 *
 *  ⚠ 빌드를 새로 올려도 위 URL 은 그대로 유지된다(스토어 식별자는 불변).
 *     따라서 `/app` 랜딩·QR·공유 링크는 한 번 만들면 영구적으로 유효하다.
 *
 *  사용처: `/app` 랜딩 페이지(버튼·OS 자동 분기), 공유/QR.
 */

export const APP_STORE_URL = "https://apps.apple.com/kr/app/id6781289580";

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=kr.pibutenten.app";

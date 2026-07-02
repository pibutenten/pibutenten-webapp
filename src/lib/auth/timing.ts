import { timingSafeEqual } from "crypto";

/**
 * timing-safe 문자열 비교 헬퍼 (보안 하드닝 패키지 C, 2026-07-02).
 *
 * `===` 문자열 비교는 첫 불일치 문자에서 조기 종료하므로 응답 시간으로
 * secret 을 한 글자씩 추측하는 timing side-channel 이 가능하다.
 * OAuth state / cron secret 등 비밀값 비교는 반드시 이 헬퍼를 사용한다.
 *
 * - `expected`: 서버가 알고 있는 정답값 (state 쿠키, CRON_SECRET 등).
 * - `sent`: 요청에서 온 값 — null/undefined/길이 불일치여도 동일 시간 소모 후 false.
 *   (더미 비교 길이를 expected 기준으로 고정 → 공격자 입력 길이와 무관하게 일정.)
 * - ⚠ `expected` 가 빈 문자열이면 빈 `sent` 와 매치된다 — 호출부는 반드시
 *   `!secret`(미설정) 가드를 선행할 것. 현재 호출부 전부(cron 3곳·OAuth state 2곳·
 *   push webhook)가 이 가드를 두고 있다.
 *
 * (기존: naver callback 의 stateMatches / push send 의 safeEqual 로컬 사본 → SSOT 로 여기 공통화.)
 */
export function safeEqual(
  sent: string | null | undefined,
  expected: string,
): boolean {
  const b = Buffer.from(expected, "utf8");
  const a = Buffer.from(sent ?? "", "utf8");
  if (sent == null || a.length !== b.length) {
    // 길이 불일치·부재 시에도 동일 시간 소모 (timing side-channel 차단)
    timingSafeEqual(b, Buffer.alloc(b.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

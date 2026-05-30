/**
 * slug 충돌(23505) 공용 처리 (2026-05-30).
 *
 * DB 부분 UNIQUE 인덱스 cards_doctor_year_slug_uidx 위반(동시 저장 등)을
 * 사용자 친화 메시지로 변환. publish/route.ts 와 articles/[id] PUT 이 공용 사용.
 */

/** slug 중복 시 사용자에게 보일 표준 메시지. */
export const SLUG_TAKEN_MESSAGE =
  "이미 사용 중인 URL slug 입니다. 다른 값을 입력해 주세요.";

/**
 * Supabase/Postgres 에러가 post_slug 부분 UNIQUE 인덱스 위반인지 판별.
 * - code '23505' (unique_violation) + 우리 인덱스명 포함.
 */
export function isSlugUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; details?: string };
  const blob = `${e.message ?? ""} ${e.details ?? ""}`;
  return e.code === "23505" && blob.includes("cards_doctor_year_slug_uidx");
}

/**
 * 회원 글 URL용 8자 base58 shortcode 생성·검증.
 *
 * 알파벳: 혼동 가능한 0/O/1/l/I 제외 → 58글자.
 * 8자 = 58^8 ≈ 128조 조합. 한 사이트 규모(~수만 글)에서 충돌 0.
 *
 * 충돌 방지: 호출자가 DB UNIQUE 제약 위반 시 재시도 (예: /api/articles).
 */
import { customAlphabet } from "nanoid";

const ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SHORTCODE_LEN = 8;

export const generateShortcode = customAlphabet(ALPHABET, SHORTCODE_LEN);

const PATTERN = new RegExp(`^[${ALPHABET}]{6,12}$`);

export function isValidShortcode(s: string | null | undefined): boolean {
  return typeof s === "string" && PATTERN.test(s);
}

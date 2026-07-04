/**
 * 피부텐텐 슬러그 매핑 헬퍼
 *
 * SSOT: DB `tag_dictionary` → 빌드타임 스냅샷의 `slug`(ko/alias → en).
 *   (이전 procedure-mappings.json 직접 의존 제거 — L2-4.)
 *   R4-3: 클라 컴포넌트(SlugField·DraftClient)가 import 하므로 경량 클라 스냅샷
 *   `tag-dictionary.client.generated.json` 을 읽는다 — `slug` 필드는 전체 스냅샷과
 *   동일 데이터(같은 객체 투영)라 서버 라우트(articles/publish/slug-check) 동작 불변.
 *
 * 사용 예시:
 *   import { buildSlug } from '@/data/procedure-mappings/slug-mapping';
 *   const slug = buildSlug(['쥬브젠', '효과', '지속기간']); // → 'juvgen-effect-duration'
 */

import snapshot from "@/data/tag-dictionary.client.generated.json";

// ko/alias → 영문 slug (스냅샷). alias 도 pass2 로 대표어 en 을 상속.
const KO_TO_EN: Record<string, string> = (snapshot as { slug: Record<string, string> }).slug;

// ─────────────────────────────────────────────────────────────
// Public API — 한글 → 영문 슬러그
// ─────────────────────────────────────────────────────────────

/** 단일 한글 태그 → 영문 슬러그. 매핑 없으면 null. */
export function getEnglishSlug(koreanTerm: string): string | null {
  return KO_TO_EN[koreanTerm.trim()] ?? null;
}

/** 영문 단어(`-` split) 기준 기본 목표 단어 수. */
export const SLUG_TARGET_WORDS = 3;

/** 영문 단어 최대 (의미 더해질 때만). */
export const SLUG_MAX_WORDS = 4;

/** 슬러그 최대 글자 수. 초과 시 마지막 `-` 경계에서 cut. */
export const SLUG_MAX_LEN = 50;

function wordCount(parts: string[]): number {
  return parts.reduce((acc, p) => acc + p.split("-").length, 0);
}

/**
 * 여러 태그를 결합하여 URL slug 생성. (PRD §11-A 룰)
 *
 * 룰:
 * - 영문 단어 기준 기본 3개, 최대 4개 (의미 더해질 때만).
 * - **부분 중복 제거**: 새 영문의 단어 중 기존에 이미 있는 단어는 제거.
 * - 매핑 없는 항목은 무시.
 * - 모두 매핑 실패 시 'untagged-{timestamp}' 폴백.
 * - 결과는 소문자 + 하이픈 결합. 50자 초과 시 마지막 `-` 경계에서 cut.
 *
 * @param tags 태그 배열 (예: ['쥬브젠', '눈가주름', '히알루론산'])
 * @returns URL slug
 */
export function buildSlug(tags: string[]): string {
  const parts: string[] = [];
  const seenEn = new Set<string>();

  for (const tag of tags) {
    const en = getEnglishSlug(tag);
    if (!en || seenEn.has(en)) continue;

    const existingWords = new Set(parts.length ? parts.join("-").split("-") : []);

    // 부분 중복 처리: 기존에 이미 있는 단어 제거
    const newWords = en.split("-");
    const filtered = newWords.filter((w) => !existingWords.has(w));
    if (filtered.length === 0) continue; // 완전 중복

    const newTotal = wordCount(parts) + filtered.length;

    // 4 단어 초과면 skip (첫 항목 예외)
    if (parts.length > 0 && newTotal > SLUG_MAX_WORDS) continue;

    parts.push(en);
    seenEn.add(en);

    // 3 단어 이상 도달 → break (단, 한글 1개가 영문 3+ 단어 차지하면 한 개 더 시도)
    if (wordCount(parts) >= SLUG_TARGET_WORDS && parts.length >= 2) break;
  }

  if (parts.length === 0) {
    return `untagged-${Date.now().toString(36)}`;
  }

  let s = parts.join("-").toLowerCase();
  if (s.length > SLUG_MAX_LEN) {
    const cut = s.slice(0, SLUG_MAX_LEN);
    const last = cut.lastIndexOf("-");
    s = last > 5 ? cut.slice(0, last) : cut;
  }
  return s;
}

/**
 * 충돌 발생 시 다음 사용 가능한 슬러그 반환 ('-2', '-3', ...).
 */
export function resolveSlugCollision(baseSlug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(baseSlug)) return baseSlug;
  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
}

// ─────────────────────────────────────────────────────────────
// post_slug 입력 검증·정규화 (slug 편집 UI 공용 — 2026-05-30)
//   draft 화면 / edit 화면 / 서버 라우트 / slug-check API 가 모두 이 함수만 사용.
// ─────────────────────────────────────────────────────────────

/** post_slug 최소 길이 (너무 짧은 일반 slug 방지). */
export const SLUG_MIN_LEN = 2;

/** 허용 형식: 소문자 영숫자 + 하이픈, 앞뒤는 영숫자. */
const POST_SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * post_slug 형식 검증. (URL /doctors/{slug}/{year}/{post_slug} 용)
 * - 소문자 영숫자·하이픈만, 앞뒤 영숫자, 길이 2~50.
 */
export function isValidPostSlug(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length < SLUG_MIN_LEN || s.length > SLUG_MAX_LEN) return false;
  return POST_SLUG_RE.test(s);
}

/**
 * 임의 입력 → post_slug 형식으로 정규화 (ASCII 한정 클린업).
 *   - 소문자화, 공백·언더스코어 → 하이픈, 허용외 문자 제거, 중복/양끝 하이픈 정리, 50자 컷.
 *   - 한글 등 비-ASCII 는 제거됨 → 결과가 비거나 무효일 수 있음(호출부에서 buildSlug fallback).
 */
export function normalizeToSlug(input: string): string {
  const lowered = (input ?? "").trim().toLowerCase();
  if (POST_SLUG_RE.test(lowered) && lowered.length <= SLUG_MAX_LEN) return lowered;
  let cleaned = lowered
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length > SLUG_MAX_LEN) {
    const cut = cleaned.slice(0, SLUG_MAX_LEN);
    const last = cut.lastIndexOf("-");
    cleaned = last > 5 ? cut.slice(0, last) : cut;
  }
  return cleaned;
}

export default {
  getEnglishSlug,
  buildSlug,
  resolveSlugCollision,
  isValidPostSlug,
  normalizeToSlug,
};

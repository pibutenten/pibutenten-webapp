/**
 * 피부텐텐 슬러그 매핑 헬퍼
 *
 * 사용 예시:
 *   import { buildSlug, getEnglishSlug } from '@/data/slug-mapping';
 *
 *   const tags = ['쥬브젠', '효과', '지속기간'];
 *   const slug = buildSlug(tags);
 *   // → 'juvgen-effect-duration'
 *
 *   const single = getEnglishSlug('정한미');
 *   // → null (의사명은 별도 매핑)
 */

import mappingsData from './procedure-mappings.json';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Category = 'lifting' | 'injectables' | 'concerns' | 'homecare' | 'knowledge';

export type MappingType = 'brand' | 'medical' | 'general' | 'synonym';

export interface ProcedureMapping {
  ko: string;
  en: string;
  category: Category;
  type: MappingType;
  synonyms?: string[];
  notes?: string;
}

export interface MappingsData {
  version: string;
  lastUpdated: string;
  categories: Record<Category, string>;
  mappings: ProcedureMapping[];
}

// ─────────────────────────────────────────────────────────────
// Internal: Build lookup index (한글 → 영문 슬러그)
// ─────────────────────────────────────────────────────────────

const data = mappingsData as unknown as MappingsData;
const koToEnIndex = new Map<string, string>();

for (const m of data.mappings) {
  koToEnIndex.set(m.ko, m.en);
  if (m.synonyms) {
    for (const synonym of m.synonyms) {
      koToEnIndex.set(synonym, m.en);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * 단일 한글 태그 → 영문 슬러그 변환.
 * 매핑이 없으면 null 반환.
 */
export function getEnglishSlug(koreanTerm: string): string | null {
  return koToEnIndex.get(koreanTerm.trim()) ?? null;
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
 *   예: parts=[hand] + hand-cream → cream 만 → 결과 hand-cream
 *   예: parts=[square-jaw, botox] + square-jaw-botox → 완전 중복 → skip
 * - 한 한글 키워드가 영문 3+ 단어 차지하는 케이스(예: 손등=back-of-hand, 폐기된 매핑이지만)는
 *   차별화를 위해 한 개 더 시도.
 * - 매핑 없는 항목은 무시.
 * - 모두 매핑 실패 시 'untagged-{timestamp}' 폴백.
 * - 결과는 소문자 + 하이픈 결합. 50자 초과 시 마지막 `-` 경계에서 cut.
 *
 * @param tags 태그 배열 (예: ['쥬브젠', '눈가주름', '히알루론산'])
 * @returns URL slug (예: 'juvgen-eye-wrinkle-hyaluronic-acid' → trim 후 'juvgen-eye-wrinkle')
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
 * 충돌 발생 시 다음 사용 가능한 슬러그 반환.
 *
 * @param baseSlug 원본 슬러그
 * @param existingSlugs 이미 존재하는 슬러그 목록 (DB에서 query)
 * @returns 충돌 없는 슬러그 ('-2', '-3', ... 자동 부여)
 */
export function resolveSlugCollision(
  baseSlug: string,
  existingSlugs: Set<string>
): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }

  return `${baseSlug}-${counter}`;
}

/**
 * 카테고리별 매핑 조회.
 */
export function getMappingsByCategory(category: Category): ProcedureMapping[] {
  return data.mappings.filter(m => m.category === category);
}

/**
 * 매핑 type별 조회 (예: 모든 브랜드).
 */
export function getMappingsByType(type: MappingType): ProcedureMapping[] {
  return data.mappings.filter(m => m.type === type);
}

/**
 * 영문 슬러그 → 한글 태그 (역방향 조회).
 * 동일 영문에 여러 한글이 있으면 첫 번째 것만 반환.
 */
export function getKoreanTerm(englishSlug: string): string | null {
  const found = data.mappings.find(m => m.en === englishSlug);
  return found?.ko ?? null;
}

/**
 * 매핑 사전 메타정보.
 */
export function getMappingsMetadata(): { version: string; lastUpdated: string; totalEntries: number } {
  return {
    version: data.version,
    lastUpdated: data.lastUpdated,
    totalEntries: data.mappings.length,
  };
}

/**
 * 자동완성용 — 한글 입력으로 시작하는 매핑 검색.
 */
export function searchMappings(prefix: string, limit = 10): ProcedureMapping[] {
  const lowerPrefix = prefix.toLowerCase().trim();
  if (!lowerPrefix) return [];

  return data.mappings
    .filter(m => m.ko.toLowerCase().includes(lowerPrefix) || m.en.toLowerCase().includes(lowerPrefix))
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────
// Debug / 개발용
// ─────────────────────────────────────────────────────────────

/**
 * 모든 매핑을 평탄화된 형태로 반환 (테스트·디버깅용).
 */
export function getAllMappings(): ProcedureMapping[] {
  return [...data.mappings];
}

// ─────────────────────────────────────────────────────────────
// post_slug 입력 검증·정규화 (slug 편집 UI 공용 — 2026-05-30)
//   draft 화면 / edit 화면 / 서버 라우트 / slug-check API 가 모두 이 함수만 사용.
//   규칙 엇갈림 방지 (트랙 B 교훈).
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
 *   - 한글 등 비-ASCII 는 제거됨 → 결과가 비거나 무효일 수 있음.
 *     이 경우 호출부에서 buildSlug(keywords) 제안값으로 fallback 한다 (키워드가 있는 곳에서).
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
  getMappingsByCategory,
  getMappingsByType,
  getKoreanTerm,
  getMappingsMetadata,
  searchMappings,
  getAllMappings,
};

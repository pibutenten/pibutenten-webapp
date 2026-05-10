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

/**
 * 여러 태그를 결합하여 URL slug 생성.
 *
 * 규칙:
 * - 매핑 사전에 있는 한글만 영문으로 변환
 * - 매핑 없는 항목은 무시
 * - 모두 매핑 실패 시 'untagged-{timestamp}' 폴백
 * - 결과는 소문자 + 하이픈 결합
 *
 * @param tags 태그 배열 (예: ['쥬브젠', '효과', '지속기간'])
 * @returns URL slug (예: 'juvgen-effect-duration')
 */
export function buildSlug(tags: string[]): string {
  const validParts = tags
    .map(tag => getEnglishSlug(tag))
    .filter((s): s is string => s !== null && s.length > 0);

  if (validParts.length === 0) {
    return `untagged-${Date.now().toString(36)}`;
  }

  return validParts.join('-').toLowerCase();
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

export default {
  getEnglishSlug,
  buildSlug,
  resolveSlugCollision,
  getMappingsByCategory,
  getMappingsByType,
  getKoreanTerm,
  getMappingsMetadata,
  searchMappings,
  getAllMappings,
};

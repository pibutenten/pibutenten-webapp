import {
  getEnglishSlug,
  getMappingsByType,
} from "@/data/procedure-mappings/slug-mapping";

/**
 * 태그 → MedicalProcedure / MedicalCondition / Thing schema 변환.
 *
 * 매핑 type별 처리:
 *  - "brand", "medical", "general" 중 lifting/injectables 카테고리 → MedicalProcedure
 *  - concerns 카테고리 → MedicalCondition (피부 질환·고민)
 *  - 그 외 → Thing (기본)
 *
 * about 필드에 들어가는 객체로 — Q&A 단독 페이지의 의료 콘텐츠 신뢰도 강화.
 */

const PROCEDURE_TYPE_MAP: Record<string, string> = {
  // 시술 카테고리는 대부분 PercutaneousProcedure (피부 침습) 또는 NonInvasiveProcedure
  lifting: "https://schema.org/PercutaneousProcedure",
  injectables: "https://schema.org/PercutaneousProcedure",
};

type MappingForLookup = {
  ko: string;
  en: string;
  category: string;
  type: string;
};

let _index: Map<string, MappingForLookup> | null = null;
function getIndex(): Map<string, MappingForLookup> {
  if (_index) return _index;
  const map = new Map<string, MappingForLookup>();
  for (const m of [
    ...getMappingsByType("brand"),
    ...getMappingsByType("medical"),
    ...getMappingsByType("general"),
    ...getMappingsByType("synonym"),
  ]) {
    map.set(m.ko, m as MappingForLookup);
    if ("synonyms" in m && Array.isArray(m.synonyms)) {
      for (const s of m.synonyms) map.set(s, m as MappingForLookup);
    }
  }
  _index = map;
  return map;
}

/**
 * 단일 태그를 schema.org 객체로 변환.
 *
 *  - 시술(lifting/injectables): MedicalProcedure + procedureType
 *  - 피부 질환(concerns): MedicalCondition
 *  - 외 (homecare/knowledge): Thing
 */
export function keywordToAboutSchema(keyword: string): Record<string, unknown> {
  const idx = getIndex();
  const m = idx.get(keyword);
  if (!m) return { "@type": "Thing", name: keyword };

  const en = getEnglishSlug(keyword);
  const baseName = en
    ? { name: keyword, alternateName: en }
    : { name: keyword };

  if (m.category === "lifting" || m.category === "injectables") {
    const obj: Record<string, unknown> = {
      "@type": "MedicalProcedure",
      ...baseName,
      procedureType:
        PROCEDURE_TYPE_MAP[m.category] ??
        "https://schema.org/PercutaneousProcedure",
      bodyLocation: "Skin",
    };
    return obj;
  }

  if (m.category === "concerns") {
    return { "@type": "MedicalCondition", ...baseName };
  }

  return { "@type": "Thing", ...baseName };
}

/** keywords 배열 → about schema 배열 (5개로 제한) */
export function keywordsToAbout(
  keywords: string[] | null | undefined,
): Record<string, unknown>[] | undefined {
  if (!keywords || keywords.length === 0) return undefined;
  return keywords.slice(0, 5).map(keywordToAboutSchema);
}

import { categoryFor, slugFor } from "@/lib/procedure-dict";

/**
 * 태그 → MedicalProcedure / MedicalCondition / Thing schema 변환.
 *
 * 카테고리별 처리 (SSOT=DB tag_dictionary 스냅샷):
 *  - lifting/injectables → MedicalProcedure (+ procedureType)
 *  - concerns → MedicalCondition (피부 질환·고민)
 *  - 그 외(homecare/knowledge/미등록) → Thing (기본)
 *
 * about 필드에 들어가는 객체로 — Q&A 단독 페이지의 의료 콘텐츠 신뢰도 강화.
 */

/**
 * 단일 태그를 schema.org 객체로 변환.
 *
 *  - 시술(lifting/injectables): MedicalProcedure + procedureType
 *  - 피부 질환(concerns): MedicalCondition
 *  - 외 (homecare/knowledge): Thing
 */
export function keywordToAboutSchema(keyword: string): Record<string, unknown> {
  const en = slugFor(keyword); // 사전 미등록이면 null
  const baseName = en ? { name: keyword, alternateName: en } : { name: keyword };
  const category = categoryFor(keyword); // 미등록은 "knowledge"

  if (category === "lifting" || category === "injectables") {
    return {
      "@type": "MedicalProcedure",
      ...baseName,
      procedureType: "https://schema.org/PercutaneousProcedure",
      bodyLocation: "Skin",
    };
  }

  if (category === "concerns") {
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

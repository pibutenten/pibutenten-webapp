import { SITE_URL } from "@/lib/site";

/**
 * 발행사(피부텐텐) · 사이트(WebSite) JSON-LD 단일 출처(SSOT).
 *
 * 배경: 과거 #organization 이 layout/about/doctors/reports 4곳에서 제각각 정의돼
 *   (name·url·logo·sameAs 불일치, 일부는 name 을 법인명 "주식회사 진솔컴퍼니" 로) 같은 @id 가
 *   충돌했다. 이제 핵심 식별값은 organizationBase() 한 곳에서만 만들고, 다른 페이지는 @id 참조만 한다.
 *
 * 명명 구분(사용자 확정): "피부텐텐" = 서비스(브랜드)이자 발행 주체. "주식회사 진솔컴퍼니" = 그
 *   서비스를 운영하는 법인 — 모자관계도 동일법인도 아닌 별개 엔티티. 따라서 legalName 으로 등치하지
 *   않는다. 법인의 사업자 정보는 /about 의 독립 Organization 노드(#operator)로 분리한다.
 */

/** 발행사 조직 @id (모든 페이지 공통 참조). */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
/** 사이트 WebSite @id. */
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * 조직 sameAs — 브랜드 공식 채널만(의사 개인 계정 제외).
 *  - 위키데이터 Q140072864 는 2026-06-06 notability 사유로 삭제되어 제거(죽은 링크).
 *    재등재는 독립 출처 확보 후 별도 진행(확보 시 여기 다시 추가).
 *  - 인스타그램 공식 계정 추가(2026-06-17).
 */
const ORG_SAME_AS = [
  "https://www.youtube.com/@pibutenten",
  "https://www.instagram.com/pibutenten",
];

/**
 * 발행사 핵심 식별 노드 — 모든 #organization 정의가 동일 값으로 공유(@id 충돌 방지).
 *  /about 의 풍부한 노드(연락처·참여의사·진료분야)는 이 base 를 spread 한 뒤 확장한다.
 *  (법인 사업자 정보는 별개 엔티티이므로 /about 의 #operator 독립 노드로 분리.)
 */
export function organizationBase(): Record<string, unknown> {
  return {
    "@type": ["Organization", "MedicalOrganization"],
    "@id": ORGANIZATION_ID,
    name: "피부텐텐",
    alternateName: ["Pibutenten", "피부 텐텐"],
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    description: "피부과 전문의가 함께 만드는 피부 미용 커뮤니티",
    sameAs: ORG_SAME_AS,
  };
}

/**
 * 전역 layout 용 #organization — 핵심 식별 + 신뢰정책(E-E-A-T) 링크.
 *  모든 페이지에 동일하게 주입되어 답변·리포트 페이지의 publisher @id 참조가 같은 문서에서 해석된다.
 */
export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    ...organizationBase(),
    publishingPrinciples: `${SITE_URL}/editorial-policy`,
    ethicsPolicy: `${SITE_URL}/editorial-policy`,
    correctionsPolicy: `${SITE_URL}/corrections`,
    ownershipFundingInfo: `${SITE_URL}/disclosures`,
    medicalSpecialty: ["Dermatology"],
  };
}

/** WebSite 노드(전역 layout) — 발행사 참조 + 사이트 검색 액션. */
export function buildWebsiteSchema(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: "피부텐텐",
    alternateName: "Pibutenten",
    inLanguage: "ko-KR",
    publisher: { "@id": ORGANIZATION_ID },
    // 검색은 루트 /?q= 인라인(robots 비차단, noindex+follow). sitelinks searchbox 용.
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

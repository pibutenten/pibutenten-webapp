/**
 * 정책·안내 페이지 네비게이션 SSOT (2026-05-28 신설).
 *
 * 11개 정책·안내 페이지를 4개 대분류로 매핑한 단일 출처.
 * - 상단 chip nav (InfoPageNav) 가 1단/2단 chip 렌더에 사용
 * - SiteFooter 가 footer 노출 8개 필터에 사용 (inFooter: true)
 *
 * 변경 시 chip nav 와 footer 양쪽이 자동 동기화됨 → 누더기 차단.
 *
 * 분배 (3/4/2/2):
 *   소개:        사이트 안내 / 편집 정책 / 의학 검수 프로세스
 *   콘텐츠 정책: 의료 정보 안내 / 이해상충 공개 / 정정 정책 / 의사 답변 가이드라인
 *   이용 안내:   이용약관 / 개인정보 처리방침
 *   문의·신고:   문의 / 콘텐츠 신고
 *
 * footer 8개 노출 정책:
 *   법적 의무 4: 이용약관 / 개인정보 처리방침 / 문의 / 콘텐츠 신고
 *   신뢰성 4:    사이트 안내 / 편집 정책 / 의학 검수 프로세스 / 의료 정보 안내
 *   sub-chip 만 노출 3 (footer 제외): 이해상충 / 정정 정책 / 의사 답변 가이드라인
 */

export type PolicyCategoryKey = "intro" | "content" | "usage" | "contact";

export type InfoPageKey =
  | "about"
  | "editorial-policy"
  | "medical-review"
  | "disclaimer"
  | "disclosures"
  | "corrections"
  | "doctor-guidelines"
  | "terms"
  | "privacy"
  | "contact"
  | "report";

export type PolicySubItem = {
  key: InfoPageKey;
  label: string;
  href: string;
  /** footer 에도 노출할지 — false 면 상단 sub-chip + sitemap 만 */
  inFooter: boolean;
};

export type PolicyCategory = {
  key: PolicyCategoryKey;
  label: string;
  /** 1단 chip 클릭 시 진입 페이지 (해당 카테고리의 첫 sub) */
  defaultHref: string;
  items: ReadonlyArray<PolicySubItem>;
};

export const POLICY_NAV: ReadonlyArray<PolicyCategory> = [
  {
    key: "intro",
    label: "소개",
    defaultHref: "/about",
    items: [
      { key: "about",            label: "사이트 안내",          href: "/about",            inFooter: true },
      { key: "editorial-policy", label: "편집 정책",            href: "/editorial-policy", inFooter: true },
      { key: "medical-review",   label: "의학 검수 프로세스",   href: "/medical-review",   inFooter: true },
    ],
  },
  {
    key: "content",
    label: "콘텐츠 정책",
    defaultHref: "/disclaimer",
    items: [
      { key: "disclaimer",        label: "의료 정보 안내",       href: "/disclaimer",        inFooter: true  },
      { key: "disclosures",       label: "이해상충 공개",        href: "/disclosures",       inFooter: false },
      { key: "corrections",       label: "정정 정책",            href: "/corrections",       inFooter: false },
      { key: "doctor-guidelines", label: "의사 답변 가이드라인", href: "/doctor-guidelines", inFooter: false },
    ],
  },
  {
    key: "usage",
    label: "이용 안내",
    defaultHref: "/terms",
    items: [
      { key: "terms",   label: "이용약관",           href: "/terms",   inFooter: true },
      { key: "privacy", label: "개인정보 처리방침", href: "/privacy", inFooter: true },
    ],
  },
  {
    key: "contact",
    label: "문의·신고",
    defaultHref: "/contact",
    items: [
      { key: "contact", label: "문의",         href: "/contact", inFooter: true },
      { key: "report",  label: "콘텐츠 신고", href: "/report",  inFooter: true },
    ],
  },
] as const;

/** 각 페이지 key → 소속 카테고리 key 역인덱스 (1단 chip active 결정용) */
export const PAGE_TO_CATEGORY: Record<InfoPageKey, PolicyCategoryKey> = (() => {
  const map = {} as Record<InfoPageKey, PolicyCategoryKey>;
  for (const cat of POLICY_NAV) {
    for (const item of cat.items) {
      map[item.key] = cat.key;
    }
  }
  return map;
})();

/** footer 노출 대상 8개 (inFooter: true) — 정의 순서 유지 */
export const FOOTER_ITEMS: ReadonlyArray<PolicySubItem> = POLICY_NAV.flatMap(
  (c) => c.items.filter((i) => i.inFooter)
);

/** 카테고리 key → 카테고리 객체 lookup */
export function getCategory(key: PolicyCategoryKey): PolicyCategory {
  const cat = POLICY_NAV.find((c) => c.key === key);
  if (!cat) throw new Error(`Unknown policy category: ${key}`);
  return cat;
}

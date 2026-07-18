/**
 * 원장 대표 논문 1건 (PubMed 기반).
 * title/journal/year 는 PubMed esummary 기준 정규값 — 화면 "대표 논문" 표시 +
 * ScholarlyArticle JSON-LD(name·datePublished·isPartOf) 양쪽에 사용.
 */
export type DoctorPaper = {
  /** PubMed ID (숫자 문자열) */
  pmid: string;
  /** 논문 제목 (PubMed 정규 표기) */
  title: string;
  /** 저널 약어 (예: "JAMA Dermatol") */
  journal?: string;
  /** 발행 연도 (예: 2021) */
  year?: number;
};

/**
 * 의사 프로필 확장 데이터 (`doctors.profile_data` JSONB).
 *
 * 운영팀이 Supabase Studio 또는 admin/users/[id] 페이지에서 입력.
 * 모든 필드 선택 — 입력된 것만 노출됨.
 */
export type DoctorProfileData = {
  /** 졸업 학력 (예: "서울대학교 의과대학 졸업 (2010)") */
  education?: string[];
  /** 경력 (예: "힐하우스피부과 강남점 원장") */
  career?: string[];
  /** 전문 분야 (예: ["안티에이징", "리프팅", "백반증"]) */
  expertise?: string[];
  /** 학회 회원 (예: "대한피부과학회") */
  memberOf?: string[];
  /** 출판/저서 */
  publications?: string[];
  /** 외부 채널 URL (sameAs schema에 매핑) */
  youtube?: string;
  instagram?: string;
  blog?: string;
  /** 스레드(Threads) URL — 원장 개인 SNS */
  threads?: string;
  /** 병원 외부 링크 */
  clinicUrl?: string;
  /** 주소(시/구) — schema.org PostalAddress 매핑용 */
  addressRegion?: string;
  addressLocality?: string;
  /** ORCID iD (예: "0000-0002-0968-9647") — identifier + sameAs(orcid.org) 매핑 */
  orcid?: string;
  /** Google Scholar 프로필 URL — sameAs 매핑 */
  googleScholarUrl?: string;
  /**
   * 대표 논문 — 원장 프로필 페이지 "대표 논문"으로 표시 +
   * ScholarlyArticle JSON-LD(제목·연도·저널 포함, GEO 저자-논문 그래프).
   * 읽기는 항상 getDoctorPapers() 경유(구 pmids fallback 포함).
   */
  papers?: DoctorPaper[];
  /**
   * @deprecated 구 PMID-only 배열 (제목·연도 없음). 2026-07-18 papers 로 승격.
   * 읽기 fallback 용으로만 타입에 유지 — 신규 저장은 papers 로만. getDoctorPapers() 참조.
   */
  pmids?: string[];
  /** 학회 임원직 (예: "대한피부과의사회 홍보간사") — 화면 "학회 활동" + memberOf(OrganizationRole) */
  societyRoles?: string[];
  /** 전문의 자격 취득연도 (예: 2017) — 화면 표시 + hasCredential */
  boardCertifiedYear?: number;
};

/** ORCID iD → 정규 URL (orcid.org). 없으면 null. */
export function orcidUrl(p: DoctorProfileData): string | null {
  return p.orcid ? `https://orcid.org/${p.orcid}` : null;
}

/** 안전하게 JSONB → DoctorProfileData 변환 */
export function asDoctorProfileData(raw: unknown): DoctorProfileData {
  if (!raw || typeof raw !== "object") return {};
  return raw as DoctorProfileData;
}

/**
 * 대표 논문 목록 — 화면 표시·ScholarlyArticle JSON-LD 의 단일 진입점.
 * papers 우선. 구 pmids(제목 없음)만 있으면 title 빈 값으로 변환(fallback).
 */
export function getDoctorPapers(p: DoctorProfileData): DoctorPaper[] {
  if (p.papers && p.papers.length > 0) return p.papers;
  if (p.pmids && p.pmids.length > 0)
    return p.pmids.map((pmid) => ({ pmid, title: "" }));
  return [];
}

/**
 * sameAs schema용 외부 링크 배열.
 * Entity disambiguation 핵심 — 의사 ↔ 채널 ↔ 클리닉 그래프가 이어지도록
 * youtube/instagram/blog/clinicUrl + 학술 ID(ORCID·Google Scholar) 모두 포함.
 */
export function profileSameAs(p: DoctorProfileData): string[] {
  return [
    p.youtube,
    p.instagram,
    p.blog,
    p.threads,
    p.clinicUrl,
    orcidUrl(p),
    p.googleScholarUrl,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
}

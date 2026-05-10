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
};

/** 안전하게 JSONB → DoctorProfileData 변환 */
export function asDoctorProfileData(raw: unknown): DoctorProfileData {
  if (!raw || typeof raw !== "object") return {};
  return raw as DoctorProfileData;
}

/**
 * sameAs schema용 외부 링크 배열.
 * Entity disambiguation 핵심 — 의사 ↔ 채널 ↔ 클리닉 그래프가 이어지도록
 * youtube/instagram/blog/clinicUrl 모두 포함.
 */
export function profileSameAs(p: DoctorProfileData): string[] {
  return [p.youtube, p.instagram, p.blog, p.threads, p.clinicUrl].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
}

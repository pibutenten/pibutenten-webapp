import { SITE_URL } from "@/lib/site";
import {
  asDoctorProfileData,
  profileSameAs,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import { clinicId, DOCTOR_TO_CLINIC } from "@/lib/schema/clinic";

/**
 * 의사 schema 헬퍼.
 *
 *  - @type: ["Person", "MedicalProfessional"]
 *      ⚠ Physician(MedicalOrganization 상속, LocalBusiness 트리)을 쓰면 Google이
 *        의사 개인을 "비즈니스"로 인식해 telephone/address/priceRange 권장 속성 경고를 발생시킴.
 *      ✓ MedicalProfessional은 Person을 상속하므로 의사 개인 표현용으로 정확.
 *        medicalSpecialty / jobTitle / knowsAbout / alumniOf / memberOf / hasOccupation /
 *        worksFor / sameAs 모두 동일하게 지원됨.
 *  - hasOccupation: 직업 컨텍스트 풀 객체 (AI 인용 신뢰 신호 강화)
 *  - buildDoctorFull: 의사 프로필 페이지(/doctors/[slug])에만 풀 정보
 *    buildDoctorReference: Q&A·칼럼 단독 페이지에서 @id 참조용 최소 정보
 *  - sameAs / knowsAbout: profile_data 기반 자동 채움
 *
 * 9명 공통 (헬퍼 기본값 하드코딩):
 *  - memberOf: 대한피부과학회, 대한피부과의사회
 *  - qualifications: 대한민국 보건복지부 인증 피부과 전문의
 */

const COMMON_MEMBER_OF = [
  { "@type": "Organization" as const, name: "대한피부과학회" },
  { "@type": "Organization" as const, name: "대한피부과의사회" },
];

/**
 * 9명 원장 — slug ↔ 한국어 이름 SSOT.
 * AI 식별, schema, UI 표시 등 모든 곳에서 이 배열을 참조 (lib/ai/identify-doctors 등).
 * 추가/변경 시 여기만 수정. DOCTOR_TO_CLINIC (clinic.ts) 와 slug 일치 유지.
 */
export const DOCTORS = [
  { name: "정한미", slug: "jung-hanmi" },
  { name: "배정민", slug: "bae-jungmin" },
  { name: "권수현", slug: "kwon-soohyun" },
  { name: "김수형", slug: "kim-soohyung" },
  { name: "고혜림", slug: "ko-hyerim" },
  { name: "김종식", slug: "kim-jongsic" },
  { name: "이도영", slug: "rhee-doyoung" },
  { name: "강현진", slug: "kang-hyunjin" },
  { name: "박효진", slug: "park-hyojin" },
] as const;

/**
 * 9명 의사 영문 표기 매핑 — alternateName 용 (한·영 cross-reference, AI 인용 친화).
 * 이도영만 표기가 Rhee로 다름 (사용자 확정).
 */
const DOCTOR_ENGLISH_NAME: Record<string, string> = {
  "kim-jongsic": "Jongsic Kim",
  "jung-hanmi": "Hanmi Jung",
  "park-hyojin": "Hyojin Park",
  "rhee-doyoung": "Doyoung Rhee",
  "kang-hyunjin": "Hyunjin Kang",
  "kwon-soohyun": "Soohyun Kwon",
  "ko-hyerim": "Hyerim Ko",
  "kim-soohyung": "Soohyung Kim",
  "bae-jungmin": "Jungmin Bae",
};

const COMMON_QUALIFICATIONS = "대한민국 보건복지부 인증 피부과 전문의";

const COMMON_OCCUPATION = {
  "@type": "Occupation" as const,
  name: "피부과 전문의",
  occupationalCategory: "Dermatologist",
  qualifications: COMMON_QUALIFICATIONS,
};

const COMMON_YOUTUBE = "https://www.youtube.com/@pibutenten";

export type DoctorBasic = {
  slug: string;
  name: string;
  title: string;
  intro?: string | null;
  profile_data?: unknown; // doctors.profile_data JSONB
};

export function doctorPersonId(slug: string): string {
  return `${SITE_URL}/doctors/${slug}#person`;
}

/**
 * 의사 프로필 페이지(/doctors/[slug])에서 사용 — 풀세트.
 * jobTitle/hasOccupation/memberOf/alumniOf/knowsAbout/sameAs/worksFor 모두 포함.
 */
export function buildDoctorFull(d: DoctorBasic): Record<string, unknown> {
  const profile: DoctorProfileData = asDoctorProfileData(d.profile_data);
  const sameAs = uniqueArray([
    COMMON_YOUTUBE,
    ...profileSameAs(profile),
  ]);
  const knowsAbout = uniqueArray(profile.expertise ?? []);
  const clinicSlug = DOCTOR_TO_CLINIC[d.slug];
  // memberOf — 공통(피부과학회, 피부과의사회) + profile.memberOf 추가 학회
  const extraMemberOf = (profile.memberOf ?? []).map((name) => ({
    "@type": "Organization" as const,
    name,
  }));
  const memberOf = [...COMMON_MEMBER_OF, ...extraMemberOf];

  const englishName = DOCTOR_ENGLISH_NAME[d.slug];
  const obj: Record<string, unknown> = {
    "@type": ["Person", "MedicalProfessional"],
    "@id": doctorPersonId(d.slug),
    name: d.name,
    ...(englishName ? { alternateName: englishName } : {}),
    jobTitle: d.title,
    medicalSpecialty: "Dermatology",
    image: `${SITE_URL}/og/${d.slug}.png`,
    url: `${SITE_URL}/doctors/${d.slug}`,
    description: d.intro ?? undefined,
    hasOccupation: COMMON_OCCUPATION,
    memberOf,
    sameAs,
  };
  if (clinicSlug) {
    obj.worksFor = { "@id": clinicId(clinicSlug) };
  }
  if (knowsAbout.length > 0) obj.knowsAbout = knowsAbout;
  if (profile.education && profile.education.length > 0) {
    obj.alumniOf = profile.education.map((edu) => ({
      "@type": "EducationalOrganization",
      name: edu,
    }));
  }
  return obj;
}

/**
 * Q&A·칼럼 단독 페이지에서 사용 — 최소 + @id 참조.
 * 풀 정보는 @id가 가리키는 /doctors/[slug] 페이지에 존재.
 */
export function buildDoctorReference(d: {
  slug: string;
  name: string;
  title?: string;
}): Record<string, unknown> {
  const englishName = DOCTOR_ENGLISH_NAME[d.slug];
  return {
    "@type": ["Person", "MedicalProfessional"],
    "@id": doctorPersonId(d.slug),
    name: d.name,
    ...(englishName ? { alternateName: englishName } : {}),
    jobTitle: d.title ?? "피부과 전문의",
    url: `${SITE_URL}/doctors/${d.slug}`,
  };
}

function uniqueArray<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

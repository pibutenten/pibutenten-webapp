import { SITE_URL } from "@/lib/site";

/**
 * 5개 힐하우스피부과 브랜치 + 참여 전문의→지점 매핑.
 * schema.org `MedicalClinic` 객체로 빌드되며 layout.tsx 전역 @graph에 노출됨.
 *
 * 데이터 출처: 각 지점 공식 사이트 (2026-05-09 기준).
 *  - 영업시간/주소가 변경되면 이 파일 한 곳만 수정.
 *  - 위·경도는 운영팀 추후 확정 (Google/Kakao Geocoding으로 변환 가능).
 */

export type ClinicId =
  | "gangnam"
  | "suwon"
  | "pangyo"
  | "gundae"
  | "daegu";

type Hours = {
  /** 'Monday'|'Tuesday'|... 또는 ['Monday','Tuesday'] */
  dayOfWeek: string | string[];
  opens: string; // "10:00"
  closes: string; // "19:00"
};

type Clinic = {
  id: ClinicId;
  name: string;
  url: string;
  /** doctors.slug 배열 — 이 지점 소속 의사들 */
  doctorSlugs: string[];
  telephone: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
  };
  hours: Hours[];
  /** 점심시간 (해당 시간에는 OpeningHours에서 제외 처리) — 현재는 정보용으로만 보관 */
  lunch?: string;
  /** 운영팀 추후 확정 — 비어 있으면 schema에서 생략 */
  geo?: { latitude: number; longitude: number };
  postalCode?: string;
  image?: string;
};

export const CLINICS: Record<ClinicId, Clinic> = {
  gangnam: {
    id: "gangnam",
    name: "힐하우스피부과의원 강남점",
    url: "https://healhousegn.com",
    doctorSlugs: ["jung-hanmi", "bae-jungmin"],
    telephone: "+82-2-6951-5761",
    address: {
      streetAddress: "강남대로 518, 4층·5층",
      addressLocality: "강남구",
      addressRegion: "서울특별시",
    },
    geo: { latitude: 37.5090782, longitude: 127.0224067 },
    image: "https://healhousegn.com/img/main_opengraph2.jpg",
    hours: [
      {
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "10:00",
        closes: "19:00",
      },
      { dayOfWeek: "Saturday", opens: "10:00", closes: "16:00" },
    ],
  },
  suwon: {
    id: "suwon",
    name: "힐하우스피부과의원 수원점",
    url: "https://healhousesw.com",
    doctorSlugs: ["kwon-soohyun", "ko-hyerim", "kim-soohyung"],
    telephone: "+82-31-248-7730",
    address: {
      streetAddress: "매산로 24, 3층",
      addressLocality: "팔달구",
      addressRegion: "경기도 수원시",
    },
    postalCode: "16461",
    geo: { latitude: 37.2693878, longitude: 127.0085411 },
    image: "https://healhousesw.com/img/sub_logo.png",
    hours: [
      { dayOfWeek: ["Monday", "Friday"], opens: "09:30", closes: "20:00" },
      {
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday"],
        opens: "09:30",
        closes: "18:30",
      },
      { dayOfWeek: "Saturday", opens: "09:00", closes: "14:00" },
    ],
    lunch: "13:00-14:00 (토요일 제외)",
  },
  pangyo: {
    id: "pangyo",
    name: "힐하우스피부과의원 판교점",
    url: "https://www.healhousepg.com",
    doctorSlugs: ["kim-jongsic"],
    telephone: "+82-31-701-7438",
    address: {
      streetAddress: "분당내곡로 131, 2층",
      addressLocality: "분당구",
      addressRegion: "경기도 성남시",
    },
    geo: { latitude: 37.3954176, longitude: 127.1121838 },
    image: "https://www.healhousepg.com/theme/healhousepg/img/sub_logo.png",
    hours: [
      {
        dayOfWeek: ["Monday", "Wednesday", "Thursday"],
        opens: "10:00",
        closes: "19:00",
      },
      { dayOfWeek: ["Tuesday", "Friday"], opens: "10:00", closes: "20:30" },
      { dayOfWeek: "Saturday", opens: "09:30", closes: "14:00" },
    ],
    lunch: "13:30-14:30 (토요일 제외)",
  },
  gundae: {
    id: "gundae",
    name: "힐하우스피부과의원 건대점",
    url: "https://healhousegd.com",
    doctorSlugs: ["rhee-doyoung", "kang-hyunjin"],
    telephone: "+82-2-444-7585",
    address: {
      streetAddress: "능동로 90, B동 2층 C202호",
      addressLocality: "광진구",
      addressRegion: "서울특별시",
    },
    geo: { latitude: 37.5383872, longitude: 127.0709333 },
    image: "https://healhousegd.com/img/brand-value-slide-img01_new.jpg",
    hours: [
      { dayOfWeek: ["Monday", "Friday"], opens: "10:00", closes: "20:00" },
      {
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday"],
        opens: "10:00",
        closes: "19:00",
      },
      { dayOfWeek: "Saturday", opens: "10:00", closes: "15:00" },
    ],
    lunch: "13:00-14:00 (토요일 제외)",
  },
  daegu: {
    id: "daegu",
    name: "힐하우스피부과의원 대구점",
    url: "https://healhousedg.com",
    doctorSlugs: ["park-hyojin"],
    telephone: "+82-53-710-1127",
    address: {
      streetAddress: "동대구로 525, 2층",
      addressLocality: "동구",
      addressRegion: "대구광역시",
    },
    geo: { latitude: 35.881725, longitude: 128.6253287 },
    image: "https://healhousedg.com/img/sub_logo.png",
    hours: [
      { dayOfWeek: ["Monday", "Friday"], opens: "09:30", closes: "20:30" },
      {
        dayOfWeek: ["Tuesday", "Wednesday", "Thursday"],
        opens: "09:30",
        closes: "18:30",
      },
      { dayOfWeek: "Saturday", opens: "09:00", closes: "14:00" },
    ],
    lunch: "13:00-14:00 (토요일 제외)",
  },
};

/** 의사 slug → 소속 clinic id (역방향 인덱스) */
export const DOCTOR_TO_CLINIC: Record<string, ClinicId> = (() => {
  const map: Record<string, ClinicId> = {};
  for (const c of Object.values(CLINICS)) {
    for (const slug of c.doctorSlugs) map[slug] = c.id;
  }
  return map;
})();

/** clinic schema @id (전역에서 참조됨) */
export function clinicId(id: ClinicId): string {
  return `${SITE_URL}/#hillhouse-${id}`;
}

/** 그룹(MedicalOrganization) @id */
export const HILLHOUSE_GROUP_ID = `${SITE_URL}/#hillhouse-group`;

/** schema.org JSON-LD 객체 빌드 — 한 지점 */
export function buildClinicSchema(c: Clinic): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    "@type": "MedicalClinic",
    "@id": clinicId(c.id),
    name: c.name,
    url: c.url,
    telephone: c.telephone,
    priceRange: "₩₩",
    medicalSpecialty: "Dermatology",
    address: {
      "@type": "PostalAddress",
      streetAddress: c.address.streetAddress,
      addressLocality: c.address.addressLocality,
      addressRegion: c.address.addressRegion,
      addressCountry: "KR",
      ...(c.postalCode ? { postalCode: c.postalCode } : {}),
    },
    openingHoursSpecification: c.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    })),
    parentOrganization: { "@id": HILLHOUSE_GROUP_ID },
  };
  if (c.geo) {
    obj.geo = {
      "@type": "GeoCoordinates",
      latitude: c.geo.latitude,
      longitude: c.geo.longitude,
    };
  }
  if (c.image) obj.image = c.image;
  return obj;
}

/** 5개 지점 + 그룹 schema 배열 — layout.tsx의 @graph에 spread */
export function allClinicsSchema(): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = Object.values(CLINICS).map(
    buildClinicSchema,
  );
  list.push({
    "@type": "MedicalOrganization",
    "@id": HILLHOUSE_GROUP_ID,
    name: "힐하우스피부과",
    url: "https://www.healhouseskin.com",
  });
  return list;
}

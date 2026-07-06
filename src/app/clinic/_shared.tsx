"use client";

/**
 * /clinic 공용 UI·셸·타입 (B4 재설계 — 관리자 운영 페이지 패턴).
 *
 *  - ClinicShell: AppShell(wide) 래퍼 — /admin 하위 페이지와 동일한 셸/뒤로가기 관례.
 *  - StatusBadge / skinProfileRows / fmtDate: 환자 목록·상세 공용 프레젠테이션.
 *  - ClinicPatientItem: get_clinic_patient(s) RPC(0345) 1행 = /api/clinic/patients 응답 형태.
 *
 * 규칙(§8.4): 라이트 테마, 색은 CSS 변수만(하드코딩 금지), 그림자 미사용, 존댓말.
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import { GENDERS, SKIN_LABEL, FACE_LABEL } from "@/lib/profile-options";
import { FITZPATRICK_TONES } from "@/lib/fitzpatrick";

/** get_clinic_patient(s) RPC 1행. */
export type ClinicPatientItem = {
  link_id: number;
  /** pending(동의 대기) | active(연결됨) | rejected(거절) | revoked(해제) */
  status: string;
  member_handle: string | null;
  patient_name: string | null;
  patient_birthdate: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_address: string | null;
  registration_number: string | null;
  patient_skin_profile: Record<string, unknown> | null;
  consent_at: string | null;
  created_at: string;
  revoked_at: string | null;
  /** 그 환자 clinic 노트 max(visited_on) — 0351 get_clinic_patients v2 신규(§4.2-9). */
  last_visit_on: string | null;
  /** 그 환자 clinic 노트 건수 — 0351 신규(§4.2-9). */
  visit_count: number;
  /** patient_birthdate 파생 만 나이 — 0351 신규. 생일 없으면 null. */
  age_years: number | null;
};

/** 병원 모드 원장 드롭다운 항목 — DiaryForm clinicDoctors prop 과 동일 형태. */
export type ClinicDoctorOption = { id: string; name: string };

/** 흰 글상자 — DiaryForm formBox 와 동일 규칙(테두리 X·음영 X). 색·반경은 admin 토큰(--r-card). */
export const BOX = "rounded-[var(--r-card)] bg-white p-5";

/**
 * ClinicShell — 병원 운영 페이지 공용 셸. /admin 하위 페이지와 동일하게 AppShell wide 사용
 * (상단바·배경은 앱 셸, 하단 탭바 숨김, 최대 1080px). back 으로 상위 프로그램 복귀.
 */
export function ClinicShell({
  back = "/clinic",
  children,
}: {
  back?: string;
  children: React.ReactNode;
}) {
  const search = useSearchRouting();
  return (
    <AppShell active="마이" wide back={back} {...search}>
      {children}
    </AppShell>
  );
}

/**
 * 상태 배지 — 4상태 라벨·톤. admin 팔레트만(--tt-blue / --ink / --line).
 *   pending  = 연한 하늘 배경 + ink-500 (대기, 중립 강조)
 *   active   = 진한 하늘 배경 + 흰글씨 (연결됨, 최강 강조 — 대비 ≥4.5:1)
 *   rejected = 회색 배경 + ink-500 (거절, 종료)
 *   revoked  = 회색 배경 + ink-300 (해제, 가장 약함)
 */
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "동의 대기", cls: "bg-[var(--tt-blue-tint)] text-[var(--ink-500)]" },
  active: { label: "연결됨", cls: "bg-[var(--tt-blue-deep)] text-white" },
  rejected: { label: "거절", cls: "bg-[var(--line)] text-[var(--ink-500)]" },
  revoked: { label: "해제", cls: "bg-[var(--line)] text-[var(--ink-300)]" },
};

export function StatusBadge({ status }: { status: string }) {
  const b =
    STATUS_BADGE[status] ?? { label: status, cls: "bg-[var(--line)] text-[var(--ink-300)]" };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${b.cls}`}>
      {b.label}
    </span>
  );
}

const GENDER_LABEL: Record<string, string> = Object.fromEntries(
  GENDERS.map((g) => [g.key, g.label]),
);

/**
 * 피부 프로필 jsonb → 읽기 좋은 행 목록.
 * 키는 member_respond_link(0345)가 만드는 스냅샷 6종. 라벨은 각 SSOT 파생(하드코딩 금지).
 */
export function skinProfileRows(
  sp: Record<string, unknown> | null,
): { label: string; value: string; tone?: string }[] {
  if (!sp) return [];
  const rows: { label: string; value: string; tone?: string }[] = [];
  const joinStrs = (v: unknown): string | null =>
    Array.isArray(v) && v.length > 0
      ? v.filter((x): x is string => typeof x === "string" && x !== "").join(" · ") || null
      : null;

  if (typeof sp.gender === "string" && sp.gender)
    rows.push({ label: "성별", value: GENDER_LABEL[sp.gender] ?? sp.gender });
  if (typeof sp.skin_type === "string" && sp.skin_type)
    rows.push({ label: "피부타입", value: SKIN_LABEL[sp.skin_type] ?? sp.skin_type });
  const concerns = joinStrs(sp.skin_concerns);
  if (concerns) rows.push({ label: "피부고민", value: concerns });
  if (typeof sp.face_shape === "string" && sp.face_shape)
    rows.push({ label: "얼굴형", value: FACE_LABEL[sp.face_shape] ?? sp.face_shape });
  if (typeof sp.fitzpatrick === "number") {
    const t = FITZPATRICK_TONES.find((x) => x.v === sp.fitzpatrick);
    if (t) rows.push({ label: "피부색", value: `${t.v}단계 · ${t.caption}`, tone: t.tone });
  }
  const interests = joinStrs(sp.interested_procedures);
  if (interests) rows.push({ label: "관심시술", value: interests });
  return rows;
}

/** timestamptz → "YYYY. M. D." (KST 로컬). 파싱 실패 시 null. */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ko-KR");
}

/* ──────────────────────────────────────────────────────────────
 * clinic 공용 날짜·금액·나이 포맷 (SSOT — 검수 R1제안-1·R2경고).
 *  구 ClinicPatientsView/ClinicVisitsView/ClinicPatientDetailView 에
 *  각각 중복 선언돼 있던 fmtYmd·fmtPrice·fmtBirth·fmtVisitDate·fmtDateShort·
 *  ageFromBirth·kstToday 를 여기로 통합. 세 뷰가 import 재사용한다(표기·규칙 동일 유지).
 * ────────────────────────────────────────────────────────────── */

/** 요일 라벨 — DiaryDetailView 와 동일 규칙(일=0 … 토=6). */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 오늘 {y,m,d}. new Date() 로컬 대신 UTC+9 로 계산(서버·클라 일관). */
export function kstToday(): { y: number; m: number; d: number } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

/**
 * "YYYY-MM-DD"|ISO(timestamptz) → "YYYY.MM.DD"(연도 포함). 파싱 실패 시 "—".
 * ⚠ timestamptz(created_at·consent_at 등)는 **KST 기준**으로 날짜 추출(검수 반영) — 옛 regex 방식은
 *   UTC 날짜를 뽑아 자정~09시 KST 구간에 하루 어긋났다. date-only(visited_on)는 UTC 자정+9h 로 동일 유지.
 */
export function fmtYmd(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : "—";
  }
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST(Asia/Seoul)
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(
    kst.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD"(연도 포함). 형식 불일치면 원본 그대로, null 이면 "—". */
export function fmtBirth(raw: string | null): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD (요일)"(연도 포함). 형식 불일치·null 이면 "날짜 미상". */
export function fmtVisitDate(raw: string | null): string {
  if (!raw) return "날짜 미상";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw;
  const dow = DOW[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).getDay()];
  return `${m[1]}.${m[2]}.${m[3]} (${dow})`;
}

/** "YYYY-MM-DD" → "YYYY.MM.DD"(요일 없음, 다음 예약 pill용). 실패 시 원본, null 이면 null. */
export function fmtDateShort(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}

/** 금액(원) → "12만" 등 만 단위 축약. 만 미만·비정수는 "N원". null·0 이하면 null. */
export function fmtPrice(v: number | null): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 10000 && v % 10000 === 0) return `${(v / 10000).toLocaleString("ko-KR")}만`;
  if (v >= 10000) {
    const man = Math.floor(v / 10000);
    const rest = v % 10000;
    return `${man}만 ${rest.toLocaleString("ko-KR")}원`;
  }
  return `${v.toLocaleString("ko-KR")}원`;
}

/**
 * 생일("YYYY-MM-DD") → "만 N세"(KST 오늘 기준 — R2경고: new Date() 로컬 대신 kstToday).
 *   RPC date_part('year', age()) 와 동일한 만 나이 계산. 형식 불일치·범위 밖이면 "—".
 */
export function ageFromBirth(raw: string | null): string {
  if (!raw) return "—";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const [by, bm, bd] = [+m[1], +m[2], +m[3]];
  const t = kstToday();
  let age = t.y - by;
  if (t.m < bm || (t.m === bm && t.d < bd)) age -= 1;
  return age >= 0 && age <= 130 ? `만 ${age}세` : "—";
}

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
};

/** 병원 모드 원장 드롭다운 항목 — DiaryForm clinicDoctors prop 과 동일 형태. */
export type ClinicDoctorOption = { id: string; name: string };

/** 흰 글상자 — DiaryForm formBox 와 동일 규칙(테두리 X·음영 X). */
export const BOX = "rounded-[var(--radius)] bg-white p-5";

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

/** 상태 배지 — 4상태 라벨·톤(CSS 변수만). */
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "동의 대기", cls: "bg-[var(--bg)] text-[var(--text-secondary)]" },
  active: { label: "연결됨", cls: "bg-[var(--primary-soft)] text-[var(--primary-active)]" },
  rejected: { label: "거절", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  revoked: { label: "해제", cls: "bg-[var(--bg)] text-[var(--text-muted)]" },
};

export function StatusBadge({ status }: { status: string }) {
  const b =
    STATUS_BADGE[status] ?? { label: status, cls: "bg-[var(--bg)] text-[var(--text-muted)]" };
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

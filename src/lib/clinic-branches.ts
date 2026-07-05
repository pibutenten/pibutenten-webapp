/**
 * clinic-branches — 힐하우스피부과 5지점 매핑 (재사용 상수, 2026-07-05).
 *
 * 배경 (마이그 0341 · docs/plans/260704 병원계정 시술기록 대행입력 계획.md §C):
 *   원장(doctors)의 근무 지점을 건보(심평원) clinics 요양기관 코드로 참조한다.
 *   5지점 clinics 이름이 전부 '힐하우스피부과의원'으로 동일해 이름으로 지점을
 *   구분할 수 없다 → 지점명(branch)을 화면 라벨로 사용한다.
 *
 * clinicId = 건보 clinics.id (불변). backfill·admin RPC(p_clinic_id)·
 *   관리자 화면 select 가 이 값을 공유한다.
 *
 * ⚠️ 이 매핑은 마이그 0341 의 backfill CASE 문과 값이 일치해야 한다
 *    (강남점=16957 · 건대점=16956 · 대구점=16958 · 수원점=16959 · 판교점=16955).
 */

export type ClinicBranch = {
  /** 건보(심평원) clinics.id — doctors.clinic_id FK 대상. */
  clinicId: number;
  /** 지점명 (화면 라벨·doctors.branch 저장값). */
  branch: string;
  /** 전체 표기 라벨 (병원명 + 지점). select option 표시용. */
  label: string;
};

export const CLINIC_BRANCHES: readonly ClinicBranch[] = [
  { clinicId: 16957, branch: "강남점", label: "힐하우스피부과의원 강남점" },
  { clinicId: 16956, branch: "건대점", label: "힐하우스피부과의원 건대점" },
  { clinicId: 16958, branch: "대구점", label: "힐하우스피부과의원 대구점" },
  { clinicId: 16959, branch: "수원점", label: "힐하우스피부과의원 수원점" },
  { clinicId: 16955, branch: "판교점", label: "힐하우스피부과의원 판교점" },
] as const;

/** clinicId 가 5지점 화이트리스트에 속하는지 판정. */
export function isValidClinicId(id: unknown): id is number {
  return (
    typeof id === "number" &&
    Number.isInteger(id) &&
    CLINIC_BRANCHES.some((b) => b.clinicId === id)
  );
}

/** clinicId → 지점 정보 (없으면 undefined). */
export function getClinicBranch(id: number | null | undefined): ClinicBranch | undefined {
  if (id == null) return undefined;
  return CLINIC_BRANCHES.find((b) => b.clinicId === id);
}

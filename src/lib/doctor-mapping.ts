/**
 * Doctor 매핑 lookup 헬퍼 — `profiles.doctor_id` SSOT 기반.
 *
 * 원칙 (CLAUDE.md):
 *   1. 모든 권한·정체성 판정은 active profile 한 장 단위로 완결.
 *      묶음(bundle) 기준 권한 판정 금지.
 *   2. `profiles.doctor_id` 가 의사 매핑의 유일한 진실의 출처(SSOT).
 *      `doctor_accounts` 테이블은 향후 삭제 예정이므로 애플리케이션 코드는
 *      더 이상 직접 SELECT 하지 않는다.
 *
 * 본 모듈은 active profile.id 한 장을 받아 그 신분 단독 매핑만 lookup 한다.
 * 묶음(auth_user_id) 단위 권한 합산은 본 모듈 책임 밖.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 주어진 profile.id 의 doctor.id 반환.
 *  - 매핑 없음 → null
 *  - 매핑 있음 → doctor_id 값 (uuid string)
 *
 * `profiles.doctor_id` 컬럼을 직접 읽는다.
 */
export async function getDoctorIdForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("doctor_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.doctor_id as string | null) ?? null;
}

/**
 * 주어진 profile.id 의 doctor.slug 반환.
 *  - 매핑 없음 또는 slug 없음 → null
 *  - 매핑 있음 → doctors.slug 값
 */
export async function getDoctorSlugForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("doctor:doctors(slug)")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !data) return null;
  // PostgREST embedded relation can be object or array depending on FK cardinality.
  const doctor = (data as { doctor?: { slug?: string | null } | { slug?: string | null }[] | null })
    .doctor;
  const obj = Array.isArray(doctor) ? doctor[0] : doctor;
  return (obj?.slug as string | null) ?? null;
}

/**
 * 여러 profile.id 의 doctor 메타 정보를 일괄 조회.
 *
 * @returns Map<profileId, DoctorMeta> — 매핑 없는 profile 은 Map 에서 누락.
 *
 * 사용처: 헤더의 의사 1-click 진입, 댓글/QA author 의 의사 마크업, admin 사용자 목록 등
 * "다건 profile → 의사 정보" 표시 경로.
 */
export type DoctorMeta = {
  doctorId: string;
  slug: string | null;
  name: string | null;
  photoUrl: string | null;
  branch: string | null;
};

export async function getDoctorMetaBatch(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, DoctorMeta>> {
  const out = new Map<string, DoctorMeta>();
  if (!profileIds || profileIds.length === 0) return out;

  // 중복 제거
  const uniqueIds = Array.from(new Set(profileIds));

  const { data, error } = await supabase
    .from("profiles")
    .select("id, doctor_id, doctor:doctors(slug, name, photo_url, branch)")
    .in("id", uniqueIds);

  if (error || !data) return out;

  for (const row of data as Array<{
    id: string;
    doctor_id: string | null;
    doctor:
      | { slug?: string | null; name?: string | null; photo_url?: string | null; branch?: string | null }
      | { slug?: string | null; name?: string | null; photo_url?: string | null; branch?: string | null }[]
      | null;
  }>) {
    if (!row.doctor_id) continue;
    const d = Array.isArray(row.doctor) ? row.doctor[0] : row.doctor;
    out.set(row.id, {
      doctorId: row.doctor_id,
      slug: (d?.slug as string | null) ?? null,
      name: (d?.name as string | null) ?? null,
      photoUrl: (d?.photo_url as string | null) ?? null,
      branch: (d?.branch as string | null) ?? null,
    });
  }
  return out;
}

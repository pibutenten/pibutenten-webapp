/**
 * doctor_accounts 매핑 lookup 헬퍼.
 *
 * Phase 7-D (2026-05-16): `from("doctor_accounts").select("doctor_id").eq("profile_id", X).maybeSingle()`
 * 패턴이 코드베이스 18+ 곳에 분산. 핵심 경로 우선 통합.
 *
 * 사용처 (우선순위 교체 완료):
 *   - src/lib/identity-server.ts (resolveActiveIdentity)
 *   - src/app/write/[shortcode]/page.tsx
 *   - src/app/admin/users/[id]/page.tsx (primaryMapping, myMapping)
 *
 * 미교체 (확장된 select 또는 join 사용 — helper 의도 범위 밖):
 *   - src/app/[handle]/page.tsx (`doctor:doctors(id, slug, photo_url)` join)
 *   - src/app/layout.tsx (`doctor:doctors(slug, photo_url)` join, `.in(...)`)
 *   - src/app/doctors/[slug]/page.tsx (추가 `.eq("doctor_id", ...)` 필터)
 *   - src/app/admin/users/page.tsx (`.in(...)` 다건 + join)
 *   - src/app/api/comments/route.ts (join + `.in(...)`)
 *   - src/app/api/admin/users/[id]/role/route.ts (insert/update/delete)
 *   - src/app/api/admin/draft/publish/route.ts (전체 select)
 *   - src/components/CommentsBlock.tsx (Promise.all 묶음)
 *   - src/app/settings/page.tsx (join)
 *
 *   향후 단순 lookup 으로 단축 가능한 곳이 생기면 본 helper 호출로 정리.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 주어진 profile.id 에 매핑된 doctor.id 반환.
 *  - 매핑 row 없음 → null
 *  - 매핑 row 있음 → doctor_id 값 (string)
 *  - profile.id 가 호출자(auth.uid()) 묶음에 속하지 않으면 null (위조 차단)
 *
 * 구현: SECURITY DEFINER RPC `get_active_doctor_id` (마이그레이션 0158) 호출.
 *
 * 배경 — ADR 0001 "묶음 동등 독립 + active 신분 단위 권한" 원칙 준수:
 *   직접 `doctor_accounts.select().eq("profile_id", X)` 패턴은 RLS 정책
 *   `(auth.uid() = profile_id) OR is_admin()` 를 거치는데, PostgreSQL auth.uid()
 *   는 active identity 전환을 모름 (항상 primary auth_user.id). 그래서 본계가
 *   primary 가 아닌 의사(예: 정한미 원장 — 너구리 primary + 의사 본계 sub)는
 *   본인의 의사 매핑조차 못 봄 → /doctor 가드에서 doctorId=null → 홈으로 튕김.
 *
 *   해결: RLS 정책을 "본인 묶음 전체" 로 확장하면 묶음 단위 권한 합산이 되어
 *   ADR 0001 위배. 대신 active 신분의 profile.id 를 명시적으로 전달받아
 *   그 신분 단독 매핑만 lookup 하는 SECURITY DEFINER RPC 가 정답.
 *   너구리로 active 시 너구리 profile.id 전달 → null → 의사 권한 자동 상속 차단.
 */
export async function getDoctorIdForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .rpc("get_active_doctor_id", { p_profile_id: profileId })
    .returns<string | null>();
  if (error) return null;
  return (data as string | null) ?? null;
}

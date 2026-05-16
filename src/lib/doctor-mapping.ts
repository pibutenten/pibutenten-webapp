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
 *
 * 별도 권한 검사 X — 호출 측의 RLS / session 가드를 사용.
 */
export async function getDoctorIdForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", profileId)
    .maybeSingle()
    .returns<{ doctor_id: string } | null>();
  return data?.doctor_id ?? null;
}

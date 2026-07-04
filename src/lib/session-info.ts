/**
 * getSessionInfo — RSC `layout.tsx` 진입 시 호출되어 active identity 단위로
 * `SessionInfo` 를 빌드하는 서버 헬퍼.
 *
 * Sub-1 (2026-05-27): `layout.tsx` 안 인라인 정의 (97줄) 분리. 함수 본문·
 * 주석·cookie 가드 로직은 1바이트 변경 없이 그대로 이전. `force-dynamic`
 * /`revalidate`/`fetchCache` 같은 페이지 캐시 설정은 호출자 `layout.tsx` 에
 * 남아 있어야 효과가 있으므로 본 파일로 이동 X.
 */

import type { SessionInfo } from "@/lib/session-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IDENTITY_COOKIE, UUID_RE } from "@/lib/identity-shared";
import { getDoctorMetaBatch, type DoctorMeta } from "@/lib/doctor-mapping";

export async function getSessionInfo(): Promise<SessionInfo> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Phase 9 묶음 lookup — bundleProfileFilter 와 동일 패턴.
    //   2026-05-16 회귀 fix: 기존 .eq("auth_user_id", user.id) 는 일부 환경에서
    //   1 row 만 반환되어 IdentitySwitcher dropdown 사라지는 회귀 발생 → .or() OR 패턴으로 통일.
    //   2026-05-27 회귀 fix: getSessionInfo 가 base profile (id = user.id) 만 읽어서
    //   active 가 admin/user 라도 SessionInfo.role 이 base 의 role 로 박혀 메뉴 표시 회귀.
    //   → 묶음 전체를 먼저 fetch 한 뒤, cookie 기반으로 active 결정하고 그 row 에서 role/avatar
    //   /handle/displayName 을 빌드. ADR 0001 (active 단위 동등 독립 권한) 정합.
    const { data: groupRows } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, role")
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .order("created_at", { ascending: true });
    const rows = (groupRows ?? []) as Array<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      role: string;
    }>;
    if (rows.length === 0) return null;

    // 의사 매핑 (각 profile.id가 어느 doctor의 가입자인지). SSOT: profiles.doctor_id.
    const groupIds = rows.map((r) => r.id);
    const docMap = new Map<string, string>(); // profile_id → doctor.slug
    // R4-2 (2026-07-04): profile_id → doctor.id (UUID). 같은 getDoctorMetaBatch 응답에서
    // 추출 — 추가 쿼리 0. CommentsBlock 등 클라 viewer 판정(me.doctor_id) 세션 단일 출처화용.
    // 값 타입을 DoctorMeta 에 위임 — 원 타입이 nullable 로 바뀌어도 무음 불일치가 안 생기게 (검수 권고).
    const docIdMap = new Map<string, DoctorMeta["doctorId"]>();
    {
      const metaMap = await getDoctorMetaBatch(supabase, groupIds);
      for (const [pid, meta] of metaMap) {
        if (meta.slug) docMap.set(pid, meta.slug);
        docIdMap.set(pid, meta.doctorId);
      }
    }

    const identities: import("@/lib/session-types").SessionIdentity[] = rows.map(
      (r) => {
        // doctor 매핑된 row는 doctors.photo_url 우선 (single source)
        const docSlug = docMap.get(r.id);
        const avatar = docSlug ? `/doctors/${docSlug}.png` : r.avatar_url;
        return {
          // Critical-5 (2026-05-27): 항상 실제 profile.id (UUID).
          // 본 계정도 자체 profile.id (= user.id) 그대로 운반. sentinel "primary" 폐지.
          id: r.id,
          handle: r.handle ?? "",
          displayName: r.display_name ?? user.email ?? "",
          avatarUrl: avatar,
          kind: r.role, // role을 kind alias로 사용
        };
      },
    );

    // dropdown 정렬 — 역할 우선도 (UI 표시 순서만, 권한 부여와 무관).
    // ADR 0001 동등 독립 원칙: 정렬은 표시 순서일 뿐, 위계 의미 없음.
    const KIND_ORDER: Record<string, number> = {
      admin: 0,
      doctor: 1,
      user: 2,
    };
    identities.sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99),
    );

    // 활성 identity 결정 — cookie 가 UUID 이고 묶음 내 identity 면 사용, 그 외 base profile.id (= user.id).
    // Critical-5 (2026-05-27): 옛 sentinel "primary" 비교 폐지. 항상 UUID.
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const activeFromCookie = cookieStore.get(IDENTITY_COOKIE)?.value;
    const activeIdentityId =
      activeFromCookie &&
      UUID_RE.test(activeFromCookie) &&
      rows.some((r) => r.id === activeFromCookie)
        ? activeFromCookie
        : user.id;

    // ADR 0001 active 단위 정합 (2026-05-27): role/avatar/handle/displayName/doctorSlug
    // 모두 ACTIVE profile 기준으로 결정. 옛: base profile (user.id) 기준이라 admin active
    // 인데 base 가 doctor 인 케이스에서 me.role='doctor' 박혀 모든 카드 메뉴 가림 회귀.
    const activeRow = rows.find((r) => r.id === activeIdentityId) ?? rows[0];
    const activeDoctorSlug = docMap.get(activeRow.id) ?? null;
    const activeDoctorId = docIdMap.get(activeRow.id) ?? null;

    return {
      role: (activeRow.role as "admin" | "doctor" | "user") ?? "user",
      displayName: activeRow.display_name ?? user.email ?? "",
      avatarUrl: activeRow.avatar_url ?? null,
      handle: activeRow.handle ?? null,
      doctorSlug: activeDoctorSlug,
      doctorId: activeDoctorId,
      identities,
      activeIdentityId,
    };
  } catch {
    return null;
  }
}

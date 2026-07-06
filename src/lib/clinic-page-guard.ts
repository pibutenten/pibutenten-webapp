import { redirect, notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLES } from "@/lib/identity-shared";
import type { ActiveIdentity } from "@/lib/identity-shared";
import { resolveActiveIdentity } from "@/lib/identity-server";

/**
 * requireClinicPage — /clinic/* 서버 페이지 공용 가드 (admin-page-guard 패턴).
 *
 *  - 비로그인 → /login?next=<경로> (기본 /clinic).
 *  - active 명함이 role='clinic' + clinic_id 보유가 아니면 notFound()
 *    (병원 화면의 존재 자체를 일반 회원에게 숨김 — 계획 §8.1 is_clinic 게이트).
 *
 * 반환 active 는 role='clinic' + clinicId != null 이 보장된다(비-null 단언 안전).
 */
export async function requireClinicPage(
  supabase: SupabaseClient,
  next = "/clinic",
): Promise<{ userId: string; active: ActiveIdentity & { clinicId: number } }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  // resolveActiveIdentity 직접 호출 — getIdentityContext 는 내부에서 getUser 를 다시 부르므로
  //   admin-page-guard 와 동일하게 auth 왕복 중복을 피한다(검수 반영).
  const active = await resolveActiveIdentity(supabase, user.id, user.email);
  if (!active || active.role !== ROLES.CLINIC || active.clinicId == null) {
    notFound();
  }
  return { userId: user.id, active: active as ActiveIdentity & { clinicId: number } };
}

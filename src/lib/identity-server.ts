/**
 * Identity 서버 헬퍼 — next/headers 의존, server-only.
 *
 * Phase 2 정리 (2026-05-16): identity.ts 와 admin-page-guard.ts 가
 * 거의 동일한 50줄 로직(cookie → targetProfileId → profile/doctor_accounts lookup)을
 * 별도로 가지고 있던 것을 단일 헬퍼로 추출.
 *
 * - resolveActiveIdentity(supabase, authUserId): ActiveIdentity 또는 null 반환
 * - 본인 묶음(auth_user_id == authUserId) 검증 포함 — 다른 사람 profile 위조 차단
 * - doctor_accounts 매핑 lookup 포함
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  IDENTITY_COOKIE,
  PRIMARY_IDENTITY_ID,
  UUID_RE,
  type ActiveIdentity,
} from "./identity-shared";

/**
 * cookie 'pibutenten:identity' 를 읽어 target profile.id 결정.
 *  - 'primary' 또는 cookie 없음 → authUserId 반환
 *  - 유효한 UUID 면 그 값 반환
 */
async function readTargetProfileId(authUserId: string): Promise<string> {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(IDENTITY_COOKIE)?.value ?? PRIMARY_IDENTITY_ID;
  if (cookieVal !== PRIMARY_IDENTITY_ID && UUID_RE.test(cookieVal)) {
    return cookieVal;
  }
  return authUserId;
}

/**
 * 주어진 auth user 에 대한 active identity 조회.
 * - cookie 기반 target profile.id 결정
 * - profiles 조회 + 본인 묶음(auth_user_id) 검증
 * - doctor_accounts 매핑 lookup
 * - 통과 시 ActiveIdentity 반환, 위조/누락 시 null
 *
 * 호출자(identity.ts, admin-page-guard.ts)는 이 헬퍼 결과를 그대로 사용하거나
 * 추가 권한 검사(admin 여부 등) 후 응답을 조립한다.
 */
export async function resolveActiveIdentity(
  supabase: SupabaseClient,
  authUserId: string,
  authUserEmail?: string | null,
): Promise<ActiveIdentity | null> {
  const targetProfileId = await readTargetProfileId(authUserId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, role, auth_user_id")
    .eq("id", targetProfileId)
    .maybeSingle();

  // 본인 묶음 멤버 검증 — 다른 사람 profile cookie 위조 차단
  // (legacy: profiles.id 가 user.id 와 동일한 경우도 허용)
  if (
    !profile ||
    (profile.auth_user_id !== authUserId && targetProfileId !== authUserId)
  ) {
    return null;
  }

  const { data: da } = await supabase
    .from("doctor_accounts")
    .select("doctor_id")
    .eq("profile_id", targetProfileId)
    .maybeSingle();
  const doctorId = (da?.doctor_id as string | null) ?? null;
  const role = (profile.role as string) ?? "user";

  return {
    id: targetProfileId === authUserId ? PRIMARY_IDENTITY_ID : targetProfileId,
    authUserId,
    profileId: targetProfileId,
    handle: (profile.handle as string) ?? "",
    displayName: (profile.display_name as string) ?? authUserEmail ?? "",
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    role,
    doctorId,
  };
}

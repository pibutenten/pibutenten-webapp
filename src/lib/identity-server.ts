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
  UUID_RE,
  type ActiveIdentity,
} from "./identity-shared";

/**
 * Critical-5 호환성 정규화 SSOT (2026-05-28 통합).
 *
 * 옛 sentinel `"primary"` 문자열 → authUserId (= base profile.id UUID) 로 정규화.
 * 정규화 후 UUID 포맷이 아니면 null (invalid) 반환.
 *
 * 적용 위치 (호출자):
 *   - readTargetProfileId         : cookie 'pibutenten:identity' 진입점
 *   - /api/identity/switch        : POST payload identityId 진입점
 *   - 향후 새 cookie/payload 진입점이 추가되면 반드시 본 헬퍼 사용 (SSOT).
 *
 * 옛 패턴 (`raw === "primary" ? userId : raw`) 을 여러 곳에 박지 말 것.
 * 한 곳만 갱신하면 호환성 윈도우 종료 시 일괄 폐기 가능.
 */
export function normalizeLegacyIdentityValue(
  raw: string | undefined | null,
  authUserId: string,
): string | null {
  if (!raw) return null;
  const normalized = raw === "primary" ? authUserId : raw;
  return UUID_RE.test(normalized) ? normalized : null;
}

/**
 * cookie 'pibutenten:identity' 를 읽어 target profile.id (UUID) 결정.
 *
 * Critical-5 (2026-05-27) — sentinel "primary" 멸종:
 *   값이 UUID 인 경우만 사용, 그 외 (옛 "primary" / 빈 값 / 비-UUID) 는 모두 authUserId (= base profile.id) 로 fallback.
 *   호환성: 옛 쿠키 "primary" 를 들고 들어오는 사용자도 base UUID 로 자연 해소된다.
 *   다음 식별자 전환 또는 신규 로그인 시 cookie 가 UUID 로 갱신된다.
 *
 * 2026-05-28: 정규화 로직을 normalizeLegacyIdentityValue() 로 분리. 같은 호환성
 * 규칙이 /api/identity/switch 등 다른 진입점에서도 동일하게 적용되도록 SSOT 통합.
 *
 * exported — viewer-states 등에서도 동일 로직 사용 (이전 중복 정의 제거).
 */
export async function readTargetProfileId(authUserId: string): Promise<string> {
  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(IDENTITY_COOKIE)?.value;
    // 2026-05-28: 정규화 헬퍼로 통합. 옛 "primary" 도 자동 base UUID 처리.
    const normalized = normalizeLegacyIdentityValue(cookieVal, authUserId);
    if (normalized) return normalized;
  } catch (e) {
    // cookies() 컨텍스트 밖이면 authUserId 로 fallback — 의도된 흐름이지만
    // 예상치 못한 컨텍스트(예: edge runtime) 에서 권한 회귀가 일어날 수 있으므로 기록.
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      console.warn("[auth-identity] cookie 컨텍스트 읽기 실패:", e instanceof Error ? e.message : e);
    } else {
      console.error("[auth-identity] cookie 컨텍스트 읽기 실패:", e instanceof Error ? e.message : e);
    }
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

  // H-1 (2026-07-04 Phase 1-B): birthdate 는 PII 컬럼 REVOKE 대상이라 여기서 직접 SELECT
  //   하지 않는다(REVOKE 후 42501 로 전 인증 API 가 마비됨). 온보딩 게이트용 birthdate 는
  //   아래 get_onboarding_gate RPC(본인 전용 SECURITY DEFINER)로 별도 조회. terms_agreed_at
  //   은 REVOKE 대상이 아니라 그대로 SELECT.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, avatar_url, role, auth_user_id, terms_agreed_at, doctor_id",
    )
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

  // birthdate — 본인 전용 게이트 RPC 로 조회(위 SELECT 에서 분리). 검증 통과한 본인 명함이라
  //   반드시 1행 반환. 실패 시 null(온보딩 미완료로 간주 — 게이트가 안전하게 잡음).
  let birthdate: string | null = null;
  const { data: gate } = await supabase
    .rpc("get_onboarding_gate", { p_target: targetProfileId })
    .maybeSingle<{ birthdate: string | null; terms_agreed_at: string | null }>();
  birthdate = gate?.birthdate ?? null;

  // doctor_id 는 위 profiles SELECT 에 인라인 — 별도 lookup 제거 (profiles.doctor_id SSOT, 0176). 쿼리 1회 감소.
  const doctorId = (profile.doctor_id as string | null) ?? null;
  const role = (profile.role as string) ?? "user";

  return {
    // Critical-5: id == profileId 항상 (UUID). 본 계정도 자체 profile.id (= authUserId) 사용.
    id: targetProfileId,
    authUserId,
    profileId: targetProfileId,
    handle: (profile.handle as string) ?? "",
    displayName: (profile.display_name as string) ?? authUserEmail ?? "",
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    role,
    doctorId,
    birthdate,
    termsAgreedAt: (profile.terms_agreed_at as string | null) ?? null,
  };
}

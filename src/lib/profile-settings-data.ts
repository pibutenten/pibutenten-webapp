import type { User } from "@supabase/supabase-js";
import { ROLES, type ActiveIdentity } from "@/lib/identity-shared";
import { DEFAULT_VISIBILITY, type FieldVisibility } from "@/lib/profile-options";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileEditProps } from "@/app/settings/profile/ProfileEditClient";

/**
 * profile-settings-data — '프로필·설정' 폼(ProfileEditClient)용 서버 데이터 조립 (UI 개편 Phase 4-1).
 *
 * 구 `/[handle]/page.tsx` 의 isOwner 아코디언용 settings 조립 블록을 그대로 추출한 공용 함수.
 * 아코디언이 `/my/settings` 전용 화면으로 이관되면서(D9) 소비처가 이 라우트 하나가 됐다
 * (구 프로필 아코디언은 제거 — ProfileView 는 더 이상 settings 를 받지 않음).
 *
 * 규칙 (H-1, 2026-07-04 Phase 1-B — 동작 불변):
 *   - 비-PII 설정 필드는 profiles 일반 SELECT.
 *   - PII 6종(birthdate/gender/face_shape/skin_type/skin_concerns/interested_procedures)은
 *     반드시 `get_profile_pii` RPC 로 조회 후 병합 — profiles PII 컬럼 직접 SELECT 금지
 *     (마이그 0335 REVOKE, 42501 전면 실패).
 *   - 대상 명함은 active 명함(getIdentityContext SSOT — 호출자가 resolve 해 전달) 기준,
 *     없으면 base(user.id) fallback. ADR 0015 §5 (settings/profile active 명함 단위 정합).
 */

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** ProfileEditClient 폼용 profiles row — 구 [handle]/page.tsx 의 SettingsProfileRow 와 동일 컬럼. */
type SettingsProfileRow = {
  id: string;
  role: "admin" | "doctor" | "user";
  display_name: string | null;
  marketing_email_consent: boolean | null;
  news_email_consent: boolean | null;
  terms_agreed_at: string | null;
  terms_agreed_version: string | null;
  privacy_agreed_at: string | null;
  privacy_agreed_version: string | null;
  handle: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  field_visibility: FieldVisibility | null;
};

/**
 * ProfileEditClient 필수 props 조립.
 *
 * @param supabase createSupabaseServerClient() 클라이언트 (x-active-profile-id 헤더 주입 경유).
 * @param viewer   로그인 사용자(auth.getUser 결과) — 이메일·로그인 방식·userId(Storage path) 공급.
 * @param active   getIdentityContext 의 active 명함 (호출자가 role redirect 판정에 이미 resolve
 *                 했으므로 재조회 없이 전달받음). null 이면 base(user.id) fallback.
 * @returns ProfileEditProps — profiles row 부재(이론상 거의 없음) 시 null.
 */
export async function buildProfileSettingsProps(
  supabase: ServerSupabase,
  viewer: User,
  active: ActiveIdentity | null,
): Promise<ProfileEditProps | null> {
  const targetProfileId = active?.profileId ?? viewer.id;

  // 비-PII 설정 필드는 일반 SELECT, PII 6종은 get_profile_pii RPC(본인 → 전체)로 병합.
  const [{ data: spBase }, { data: spPii }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, role, display_name, marketing_email_consent, news_email_consent, terms_agreed_at, terms_agreed_version, privacy_agreed_at, privacy_agreed_version, handle, bio, avatar_url, field_visibility",
      )
      .eq("id", targetProfileId)
      .maybeSingle()
      .returns<Omit<SettingsProfileRow, "birthdate" | "gender" | "face_shape" | "skin_type" | "skin_concerns" | "interested_procedures">>(),
    supabase
      .rpc("get_profile_pii", { p_target: targetProfileId })
      .maybeSingle<{
        birthdate: string | null;
        gender: string | null;
        face_shape: string | null;
        skin_type: string | null;
        skin_concerns: string[] | null;
        interested_procedures: string[] | null;
      }>(),
  ]);
  const sp: SettingsProfileRow | null = spBase
    ? ({
        ...spBase,
        birthdate: spPii?.birthdate ?? null,
        gender: spPii?.gender ?? null,
        face_shape: spPii?.face_shape ?? null,
        skin_type: spPii?.skin_type ?? null,
        skin_concerns: spPii?.skin_concerns ?? null,
        interested_procedures: spPii?.interested_procedures ?? null,
      } as SettingsProfileRow)
    : null;
  if (!sp) return null;

  return {
    userId: viewer.id,
    targetProfileId,
    currentEmail: viewer.email ?? "",
    loginProviders: (viewer.identities ?? []).map((i) => i.provider),
    profileHref: sp.handle ? `/${sp.handle}` : "/",
    readOnlyNameAndAvatar: sp.role === ROLES.DOCTOR,
    role: sp.role,
    initial: {
      displayName: sp.display_name ?? "",
      marketingConsent: !!sp.marketing_email_consent,
      newsConsent: !!sp.news_email_consent,
      termsAgreedAt: sp.terms_agreed_at ?? null,
      termsAgreedVersion: sp.terms_agreed_version ?? null,
      privacyAgreedAt: sp.privacy_agreed_at ?? null,
      privacyAgreedVersion: sp.privacy_agreed_version ?? null,
      birthdate: sp.birthdate ?? "",
      gender: sp.gender ?? null,
      faceShape: sp.face_shape ?? null,
      skinType: sp.skin_type ?? null,
      skinConcerns: sp.skin_concerns ?? [],
      interestedProcedures: sp.interested_procedures ?? [],
      bio: sp.bio ?? "",
      avatarUrl: sp.avatar_url ?? null,
      fieldVisibility: sp.field_visibility ?? DEFAULT_VISIBILITY,
    },
  };
}

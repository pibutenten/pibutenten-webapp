import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { DEFAULT_VISIBILITY, type FieldVisibility } from "@/lib/profile-options";
import { ROLES } from "@/lib/identity-shared";
import BetaSettingsView from "./BetaSettingsView";

/**
 * /beta-skin/settings — 신규 스킨 "설정".
 *
 * 운영 settings/profile/page 의 데이터 로직(active 명함 기준 profiles fetch)을 그대로 재사용하고,
 *   폼은 운영 ProfileEditClient 를 베타 셸 안에 임베드(BetaSettingsView). profileHref 만 베타 공개 프로필로.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 설정",
  robots: { index: false, follow: false },
};

type ProfileRow = {
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

export default async function BetaSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/beta-skin/settings");

  // active 명함 단위(운영 settings/profile 와 동일 SSOT: getIdentityContext).
  const idCtx = await getIdentityContext(supabase);
  const targetProfileId = idCtx?.active?.profileId ?? user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, role, display_name, marketing_email_consent, news_email_consent, terms_agreed_at, terms_agreed_version, privacy_agreed_at, privacy_agreed_version, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url, field_visibility",
    )
    .eq("id", targetProfileId)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  const loginProviders = (user.identities ?? []).map((i) => i.provider);
  // 의사 명함은 사진·이름 read-only(운영 동일 — doctors 테이블/admin 전용 관리).
  const isDoctorTarget = profile.role === ROLES.DOCTOR;

  return (
    <BetaSettingsView
      userId={user.id}
      targetProfileId={targetProfileId}
      currentEmail={user.email ?? ""}
      loginProviders={loginProviders}
      profileHref={
        profile.handle ? `/beta-skin/u/${profile.handle}` : "/"
      }
      readOnlyNameAndAvatar={isDoctorTarget}
      role={profile.role}
      initial={{
        displayName: profile.display_name ?? "",
        marketingConsent: !!profile.marketing_email_consent,
        newsConsent: !!profile.news_email_consent,
        termsAgreedAt: profile.terms_agreed_at ?? null,
        termsAgreedVersion: profile.terms_agreed_version ?? null,
        privacyAgreedAt: profile.privacy_agreed_at ?? null,
        privacyAgreedVersion: profile.privacy_agreed_version ?? null,
        birthdate: profile.birthdate ?? "",
        gender: profile.gender ?? null,
        faceShape: profile.face_shape ?? null,
        skinType: profile.skin_type ?? null,
        skinConcerns: profile.skin_concerns ?? [],
        interestedProcedures: profile.interested_procedures ?? [],
        bio: profile.bio ?? "",
        avatarUrl: profile.avatar_url ?? null,
        fieldVisibility: profile.field_visibility ?? DEFAULT_VISIBILITY,
      }}
    />
  );
}

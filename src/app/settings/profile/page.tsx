import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import ProfileEditClient from "./ProfileEditClient";
import NotificationPreferences from "@/components/NotificationPreferences";
import BackButton from "@/components/BackButton";
import {
  DEFAULT_VISIBILITY,
  type FieldVisibility,
} from "@/lib/profile-options";
import { ROLES } from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  role: "admin" | "doctor" | "user";
  display_name: string | null;
  marketing_email_consent: boolean | null;
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

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  // POLICY-1 잔여 정리 (2026-05-29): 옛 .eq("id", user.id) (base only) →
  //   active 명함 단위. SSOT 헬퍼 `getIdentityContext` 사용 — 내부
  //   `resolveActiveIdentity` 가 IDENTITY_COOKIE → UUID 검증 → 본인 묶음
  //   (auth_user_id == user.id) 검증 → active 명함 결정 + 남의 명함 위조 차단까지
  //   일괄 처리. middleware (B-2) / onboarding (B-2) 와 같은 SSOT.
  //
  //   읽기·쓰기 한 세트 보장: 읽기 ID = 쓰기 ID = targetProfileId.
  //   active 명함이 base 와 같거나 idCtx 가 null 이면 base (user.id) 로 fallback.
  const idCtx = await getIdentityContext(supabase);
  const targetProfileId = idCtx?.active?.profileId ?? user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, role, display_name, marketing_email_consent, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url, field_visibility",
    )
    .eq("id", targetProfileId)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  const loginProviders = (user.identities ?? []).map((i) => i.provider);

  // 의사 명함의 사진·이름은 별도 관리 (doctors 테이블 / admin 전용). settings 에서
  // 변경 불가. 옛 정책 (의사 1차 명함 한정 read-only) 을 active 명함 단위로 확장 —
  // 의사 명함 active 시 항상 사진·이름 read-only.
  const isDoctorTarget = profile.role === ROLES.DOCTOR;

  return (
    <section className="mx-auto w-full max-w-[640px] space-y-5 py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      <ProfileEditClient
        userId={user.id}
        targetProfileId={targetProfileId}
        currentEmail={user.email ?? ""}
        loginProviders={loginProviders}
        profileHref={profile.handle ? `/${profile.handle}` : "/"}
        readOnlyNameAndAvatar={isDoctorTarget}
        initial={{
          displayName: profile.display_name ?? "",
          marketingConsent: !!profile.marketing_email_consent,
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
      {/* 알림 설정 — 모든 종류 on/off (doctor/admin 한정 항목은 자동 노출) */}
      <NotificationPreferences role={profile.role} />
    </section>
  );
}

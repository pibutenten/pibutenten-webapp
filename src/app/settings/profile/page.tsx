import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileEditClient from "./ProfileEditClient";
import NotificationPreferences from "@/components/NotificationPreferences";
import BackButton from "@/components/BackButton";
import {
  DEFAULT_VISIBILITY,
  type FieldVisibility,
} from "@/lib/profile-options";
import {
  IDENTITY_COOKIE,
  ROLES,
  UUID_RE,
  bundleProfileFilter,
} from "@/lib/identity-shared";

export const dynamic = "force-dynamic";

type ProfileRow = {
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
  liked_procedures: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  field_visibility: FieldVisibility | null;
};

type IdentityRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  kind: string;
  handle: string;
};

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "role, display_name, marketing_email_consent, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, bio, avatar_url, field_visibility",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  const loginProviders = (user.identities ?? []).map((i) => i.provider);

  // Critical-5 (2026-05-27): cookie 가 UUID 이고 user.id 와 다를 때만 multi-identity.
  //   - 빈 값 / UUID 아님 (옛 "primary" 포함) → base profile 자체가 active
  //   - UUID == user.id → base profile 자체가 active
  //   - UUID != user.id → 같은 묶음 다른 profile (예: doctor 부계정 / 회원 부계정)
  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(IDENTITY_COOKIE)?.value ?? null;
  const isMultiIdentity =
    activeCookie &&
    UUID_RE.test(activeCookie) &&
    activeCookie !== user.id;

  // 활성 identity profile fetch (multi-identity일 때만 — 본인 묶음 검증 포함)
  let activeIdentity: IdentityRow | null = null;
  if (isMultiIdentity) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, role, handle")
      .eq("id", activeCookie)
      .or(bundleProfileFilter(user.id))
      .maybeSingle();
    if (data) {
      activeIdentity = {
        id: (data as { id: string }).id,
        display_name: (data as { display_name: string | null }).display_name,
        avatar_url: (data as { avatar_url: string | null }).avatar_url,
        bio: (data as { bio: string | null }).bio,
        kind: (data as { role: string }).role,
        handle: (data as { handle: string | null }).handle,
      } as IdentityRow;
    }
  }

  // 표시·편집할 값 결정:
  //   - active identity 있으면 (배스킨 등): identity의 display_name/avatar/bio
  //   - 없으면 (1차 = profiles row 자체): profile의 값
  const editingDisplayName = activeIdentity
    ? activeIdentity.display_name
    : profile.display_name ?? "";
  const editingAvatarUrl = activeIdentity
    ? activeIdentity.avatar_url
    : profile.avatar_url ?? null;
  const editingBio = activeIdentity
    ? activeIdentity.bio ?? ""
    : profile.bio ?? "";
  const editingHandle = activeIdentity
    ? activeIdentity.handle
    : profile.handle ?? "";

  // 사용자 요청: 원장 본인(1차) 계정은 사진·이름 read-only (DB에 다른 곳에서 관리)
  const isDoctorPrimary = profile.role === ROLES.DOCTOR && !activeIdentity;

  return (
    <section className="mx-auto w-full max-w-[640px] space-y-5 py-6">
      <div className="mb-1 -ml-1">
        <BackButton />
      </div>
      <ProfileEditClient
        userId={user.id}
        currentEmail={user.email ?? ""}
        loginProviders={loginProviders}
        profileHref={editingHandle ? `/${editingHandle}` : "/"}
        activeIdentityId={activeIdentity?.id ?? null}
        activeIdentityKind={activeIdentity?.kind ?? null}
        readOnlyNameAndAvatar={isDoctorPrimary}
        initial={{
          displayName: editingDisplayName,
          marketingConsent: !!profile.marketing_email_consent,
          birthdate: profile.birthdate ?? "",
          gender: profile.gender ?? null,
          faceShape: profile.face_shape ?? null,
          skinType: profile.skin_type ?? null,
          skinConcerns: profile.skin_concerns ?? [],
          interestedProcedures: profile.interested_procedures ?? [],
          likedProcedures: profile.liked_procedures ?? [],
          bio: editingBio,
          avatarUrl: editingAvatarUrl,
          fieldVisibility: profile.field_visibility ?? DEFAULT_VISIBILITY,
        }}
      />
      {/* 알림 설정 — 모든 종류 on/off (doctor/admin 한정 항목은 자동 노출) */}
      <NotificationPreferences role={profile.role} />
    </section>
  );
}

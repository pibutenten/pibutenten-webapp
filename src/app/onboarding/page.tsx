import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";
import OnboardingClient from "./OnboardingClient";
import { IDENTITY_COOKIE, ROLES, UUID_RE } from "@/lib/identity-shared";
import OnboardingView from "./OnboardingView";

export const dynamic = "force-dynamic";

type ProfileRow = {
  contact_email: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  skin_info_consent_at: string | null;
  fitzpatrick: number | null;
};

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  // B-2 (2026-05-29 / POLICY-1): 온보딩 저장 대상을 active 명함 단위로 결정.
  //   IDENTITY_COOKIE 가 UUID 이고 그 명함이 호출자 묶음 (id = user.id 또는 auth_user_id = user.id)
  //   에 속하면 active 명함 ID 를, 아니면 base (user.id) 로 fallback.
  //   middleware 의 active 검사와 같은 정책 — 무한 루프 차단.
  const cookieStore = await cookies();
  const idCookie = cookieStore.get(IDENTITY_COOKIE)?.value ?? null;
  const candidateId =
    idCookie && idCookie !== "primary" && UUID_RE.test(idCookie)
      ? idCookie
      : user.id;
  let targetProfileId = user.id; // 기본값: base. 묶음 검증 통과 시 candidate 로 갱신.
  if (candidateId !== user.id) {
    const { data: cand } = await supabase
      .from("profiles")
      .select("id, auth_user_id")
      .eq("id", candidateId)
      .maybeSingle()
      .returns<{ id: string; auth_user_id: string | null } | null>();
    if (cand && (cand.id === user.id || cand.auth_user_id === user.id)) {
      targetProfileId = cand.id;
    }
  }

  // 병원 계정(role='clinic')은 회원 온보딩 대상이 아님 — 대시보드로 (middleware clinic 면제와 대칭).
  //   /onboarding 은 middleware 면제 경로라 페이지 자체 가드가 필요(clinic 직접 진입 시 회원 폼 노출 차단).
  const { data: roleRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", targetProfileId)
    .maybeSingle()
    .returns<{ role: string } | null>();
  if (roleRow?.role === ROLES.CLINIC) redirect("/clinic");

  // target profile (active or base) — 온보딩 정보 저장 대상.
  // H-1 (2026-07-04 Phase 1-B): PII 8컬럼은 get_profile_pii RPC(본인 → 전체)로, 비-PII
  //   (bio·avatar_url·skin_info_consent_at)는 일반 SELECT 로 조회 후 병합(PII REVOKE 대비).
  const [{ data: nonPii }, { data: pii }] = await Promise.all([
    supabase
      .from("profiles")
      .select("bio, avatar_url, skin_info_consent_at")
      .eq("id", targetProfileId)
      .maybeSingle()
      .returns<Pick<ProfileRow, "bio" | "avatar_url" | "skin_info_consent_at">>(),
    supabase
      .rpc("get_profile_pii", { p_target: targetProfileId })
      .maybeSingle<{
        contact_email: string | null;
        birthdate: string | null;
        gender: "male" | "female" | "other" | null;
        face_shape: string | null;
        skin_type: string | null;
        skin_concerns: string[] | null;
        interested_procedures: string[] | null;
        fitzpatrick: number | null;
      }>(),
  ]);
  const primary: ProfileRow | null = nonPii
    ? {
        contact_email: pii?.contact_email ?? null,
        birthdate: pii?.birthdate ?? null,
        gender: pii?.gender ?? null,
        face_shape: pii?.face_shape ?? null,
        skin_type: pii?.skin_type ?? null,
        skin_concerns: pii?.skin_concerns ?? null,
        interested_procedures: pii?.interested_procedures ?? null,
        bio: nonPii.bio,
        avatar_url: nonPii.avatar_url,
        skin_info_consent_at: nonPii.skin_info_consent_at,
        fitzpatrick: pii?.fitzpatrick ?? null,
      }
    : null;

  // 의사 멀티 계정 사용자는 role='user' row 의 avatar_url 을 온보딩 화면에 표시한다 (의사 명함 사진 X).
  //   - 묶음 안에 role='user' row 있으면 그 avatar 우선.
  //   - 없으면 primary row 의 avatar 사용 (단일 계정 사용자).
  let displayAvatar: string | null = primary?.avatar_url ?? null;
  const { data: groupRows } = await supabase
    .from("profiles")
    .select("id, role, avatar_url")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`);
  const userRow = (groupRows ?? []).find(
    (r) => (r as { role: string }).role === ROLES.USER,
  ) as { avatar_url: string | null } | undefined;
  if (userRow?.avatar_url) {
    displayAvatar = userRow.avatar_url;
  }

  const profile: ProfileRow | null = primary
    ? { ...primary, avatar_url: displayAvatar }
    : null;

  // Phase 7-extra (2026-05-16): 이메일 기반 dedup — OAuth provider email prefill.
  //   - profile.contact_email 이 이미 있으면 그것 사용 (사용자가 한번 수정한 값 존중).
  //   - 없으면 auth.users.email 기본값.
  const defaultEmail = profile?.contact_email ?? user.email ?? "";

  // 5번 섹션 (관심 키워드) — 발행된 카드 keywords 의 카테고리별 빈도 TOP N.
  const popularByCategory = await getPopularByCategory();

  return (
    <OnboardingView>
      <OnboardingClient
        userId={user.id}
        targetProfileId={targetProfileId}
        popularByCategory={popularByCategory}
        initial={{
          email: defaultEmail,
          birthdate: profile?.birthdate ?? "",
          gender: (profile?.gender as "male" | "female" | "other" | null) ?? null,
          faceShape: profile?.face_shape ?? null,
          skinType: profile?.skin_type ?? null,
          skinConcerns: profile?.skin_concerns ?? [],
          interestedProcedures: profile?.interested_procedures ?? [],
          bio: profile?.bio ?? "",
          avatarUrl: profile?.avatar_url ?? null,
          skinInfoConsentAt: profile?.skin_info_consent_at ?? null,
          fitzpatrick: profile?.fitzpatrick ?? null,
        }}
      />
    </OnboardingView>
  );
}

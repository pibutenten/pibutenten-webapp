import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";

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
};

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  // primary row (id = user.id) — 온보딩 정보 저장 대상 (middleware 의 birthdate 체크 기준).
  const { data: primary } = await supabase
    .from("profiles")
    .select(
      "contact_email, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

  // 의사 멀티 계정 사용자는 role='user' row 의 avatar_url 을 온보딩 화면에 표시한다 (의사 명함 사진 X).
  //   - 묶음 안에 role='user' row 있으면 그 avatar 우선.
  //   - 없으면 primary row 의 avatar 사용 (단일 계정 사용자).
  let displayAvatar: string | null = primary?.avatar_url ?? null;
  const { data: groupRows } = await supabase
    .from("profiles")
    .select("id, role, avatar_url")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`);
  const userRow = (groupRows ?? []).find(
    (r) => (r as { role: string }).role === "user",
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

  return (
    <section className="mx-auto w-full max-w-[640px] py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          피부텐텐에 오신 걸 환영해요
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          나에게 꼭 맞는 피부 정보를 추천하기 위해 몇 가지만 알려주세요.
        </p>
      </header>

      <OnboardingClient
        userId={user.id}
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
        }}
      />
    </section>
  );
}

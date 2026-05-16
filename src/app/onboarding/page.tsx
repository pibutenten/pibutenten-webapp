import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

type ProfileRow = {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

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

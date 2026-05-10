import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProfileEditClient from "./ProfileEditClient";
import {
  DEFAULT_VISIBILITY,
  type FieldVisibility,
} from "@/lib/profile-options";

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
  field_visibility: FieldVisibility | null;
};

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "role, display_name, marketing_email_consent, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, bio, field_visibility",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  return (
    <section className="mx-auto w-full max-w-[640px] py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">내 정보</h1>
        <Link
          href="/me"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          ← 마이페이지
        </Link>
      </div>

      <ProfileEditClient
        userId={user.id}
        currentEmail={user.email ?? ""}
        initial={{
          displayName: profile.display_name ?? "",
          marketingConsent: !!profile.marketing_email_consent,
          birthdate: profile.birthdate ?? "",
          gender: profile.gender ?? null,
          faceShape: profile.face_shape ?? null,
          skinType: profile.skin_type ?? null,
          skinConcerns: profile.skin_concerns ?? [],
          interestedProcedures: profile.interested_procedures ?? [],
          likedProcedures: profile.liked_procedures ?? [],
          bio: profile.bio ?? "",
          fieldVisibility: profile.field_visibility ?? DEFAULT_VISIBILITY,
        }}
      />

      {/* 프로필 사진은 별도 — 다음 phase에 통합 예정 */}
      <div className="mt-5 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-center text-[12px] text-[var(--text-muted)]">
        프로필 사진은 곧 이 화면에서 직접 변경할 수 있게 됩니다.
        지금은{" "}
        <Link href="/onboarding" className="text-[var(--primary)] underline">
          온보딩 페이지
        </Link>
        에서 변경 가능해요.
      </div>
    </section>
  );
}

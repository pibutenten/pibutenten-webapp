import { redirect } from "next/navigation";
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
  avatar_url: string | null;
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
      "role, display_name, marketing_email_consent, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, bio, avatar_url, field_visibility",
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) redirect("/login?error=프로필을 찾을 수 없습니다");

  const loginProviders = (user.identities ?? []).map((i) => i.provider);

  return (
    <section className="mx-auto w-full max-w-[640px] py-6">
      <ProfileEditClient
        userId={user.id}
        currentEmail={user.email ?? ""}
        loginProviders={loginProviders}
        profileHref={profile.handle ? `/${profile.handle}` : "/"}
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
          avatarUrl: profile.avatar_url ?? null,
          fieldVisibility: profile.field_visibility ?? DEFAULT_VISIBILITY,
        }}
      />
    </section>
  );
}


import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { DEFAULT_VISIBILITY, type FieldVisibility } from "@/lib/profile-options";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import MyPageClient, { type ProfileSettings } from "./MyPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지",
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

// 마이페이지 — 활성 명함(계정) 역할에 따라 관리자→/admin, 원장→/doctor 로 바로 이동.
//   회원·비로그인 → 마이페이지(계정 스위처 + 활동 + 프로필·계정 설정 인라인 폼).
//   '프로필·계정 설정'은 별도 페이지 이동 없이 마이페이지 안에서 펼쳐 바로 수정(ProfileEditClient 임베드).
export default async function MyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <MyPageClient />;

  const idCtx = await getIdentityContext(supabase);
  const role = idCtx?.active?.role;
  if (role === ROLES.ADMIN) redirect("/admin");
  if (role === ROLES.DOCTOR) redirect("/doctor");

  // 회원 — '프로필·계정 설정' 인라인 폼용 데이터(/settings/profile 와 동일 쿼리·매핑).
  const targetProfileId = idCtx?.active?.profileId ?? user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, role, display_name, marketing_email_consent, news_email_consent, terms_agreed_at, terms_agreed_version, privacy_agreed_at, privacy_agreed_version, handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, bio, avatar_url, field_visibility",
    )
    .eq("id", targetProfileId)
    .maybeSingle()
    .returns<ProfileRow>();

  let settings: ProfileSettings | null = null;
  if (!profile) {
    // 로그인 확인 후인데 profile row 가 없으면 데이터 정합성 문제 — 추적용 로그.
    console.error("[my] profile row missing", { targetProfileId });
  }
  if (profile) {
    settings = {
      userId: user.id,
      targetProfileId,
      currentEmail: user.email ?? "",
      loginProviders: (user.identities ?? []).map((i) => i.provider),
      profileHref: profile.handle ? `/${profile.handle}` : "/",
      readOnlyNameAndAvatar: profile.role === ROLES.DOCTOR,
      role: profile.role,
      initial: {
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
      },
    };
  }

  // 내 활동(작성글·댓글·좋아요·저장) — 작성글 prefetch + 4종 카운트. ProfileTabs 재사용.
  //   댓글·좋아요·저장은 ProfileTabs 가 탭 클릭 시 lazy fetch(RLS 가 본인분만 반환).
  const [postsRes, postsCntRes, commentsCntRes, likesCntRes, savesCntRes] = await Promise.all([
    supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("author_id", targetProfileId)
      .eq("status", "published")
      .not("category", "in", "(review,review_summary)")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<CardData[]>(),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", targetProfileId)
      .eq("status", "published")
      .not("category", "in", "(review,review_summary)"),
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", targetProfileId)
      .eq("status", "visible"),
    supabase.from("card_likes").select("card_id", { count: "exact", head: true }).eq("profile_id", targetProfileId),
    supabase.from("card_saves").select("card_id", { count: "exact", head: true }).eq("profile_id", targetProfileId),
  ]);

  const activity = {
    profileId: targetProfileId,
    posts: postsRes.data ?? [],
    postsCount: postsCntRes.count ?? 0,
    commentsCount: commentsCntRes.count ?? 0,
    likesCount: likesCntRes.count ?? 0,
    savesCount: savesCntRes.count ?? 0,
  };

  return <MyPageClient settings={settings} activity={activity} />;
}

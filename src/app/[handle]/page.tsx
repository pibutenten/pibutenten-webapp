import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type CardData } from "@/components/Card";
import ProfileTabs from "@/components/ProfileTabs";
import LogoutButton from "@/components/LogoutButton";
import { SITE_URL } from "@/lib/site";
import type { UserRole } from "@/lib/user-grades";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = {
  params: Promise<{ handle: string }>;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  alt_display_name: string | null;
  alt_avatar_url: string | null;
  alt_bio: string | null;
  role: UserRole;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  created_at: string;
  handle: string | null;
  alt_handle: string | null;
  birthdate: string | null;
  gender: "male" | "female" | "other" | null;
  face_shape: string | null;
  skin_type: string | null;
  skin_concerns: string[] | null;
  interested_procedures: string[] | null;
  liked_procedures: string[] | null;
  field_visibility: Record<string, boolean> | null;
  auth_user_id: string | null;
};

/**
 * 회원 프로필 페이지 — 핸들 기반 (v4 spec).
 *
 * URL: /{handle}
 *  - handle 매칭 → official 페르소나 뷰
 *  - alt_handle 매칭 → personal 페르소나 뷰 (의사·관리자가 personal id로 글 쓸 때)
 *  - 매칭 없음 → 404
 *
 * 본인 보기일 때만 [수정], [프로필 전환], [활동], [설정], [로그아웃] 노출 (다음 phase에서 추가).
 * 외부인 보기는 작성 글·댓글 탭만.
 */
/**
 * Lookup priority:
 *   1) profiles.handle  (primary identity)
 *   2) profiles.alt_handle  (legacy)
 *
 * Phase 9: 모든 ID는 profiles에 독립 row로 존재. profile_identities lookup 제거.
 */
async function fetchProfileByHandle(
  handle: string,
): Promise<{
  profile: ProfileRow;
  isAlt: boolean;
  /** doctor identity 정보 (doctor_accounts 매핑 있을 때) */
  identity?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    kind: string;
    doctor_id: string | null;
  };
} | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle)) return null;
  const supabase = await createSupabaseServerClient();
  const select =
    "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, bio, avatar_url, is_public, created_at, handle, alt_handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, field_visibility, auth_user_id";

  // 1) profiles.handle 매칭 — Phase 9 단일 모델
  let { data } = await supabase
    .from("profiles")
    .select(select)
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (data) {
    // doctor_accounts 매핑 확인 — doctor 사진·정보 single source
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor:doctors(id, slug, photo_url)")
      .eq("profile_id", data.id)
      .maybeSingle();
    const doc = (
      Array.isArray(da?.doctor) ? da?.doctor?.[0] : da?.doctor
    ) as { id: string; slug: string; photo_url: string | null } | undefined;
    if (doc) {
      return {
        profile: data,
        isAlt: false,
        identity: {
          id: data.id,
          display_name: data.display_name ?? handle,
          avatar_url: doc.photo_url ?? `/doctors/${doc.slug}.png`,
          bio: data.bio,
          kind: "doctor",
          doctor_id: doc.id,
        },
      };
    }
    return { profile: data, isAlt: false };
  }

  // 2) profiles.alt_handle (legacy personal persona — 점진 폐기 예정)
  ({ data } = await supabase
    .from("profiles")
    .select(select)
    .eq("alt_handle", handle)
    .maybeSingle()
    .returns<ProfileRow>());
  if (data) return { profile: data, isAlt: true };

  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const result = await fetchProfileByHandle(handle);
  if (!result) return { title: "찾을 수 없는 회원" };
  const { profile, isAlt, identity } = result;
  const name = identity
    ? identity.display_name
    : isAlt
      ? profile.alt_display_name ?? handle
      : profile.display_name ?? handle;
  const bio = identity ? identity.bio : isAlt ? profile.alt_bio : profile.bio;
  return {
    // v5.1: handle 노출 X — 닉네임만 (layout template이 "피부텐텐 | …" prefix 자동 추가)
    title: name,
    description: bio ?? `${name}의 피부텐텐 프로필`,
    alternates: { canonical: `${SITE_URL}/${handle}` },
    robots: profile.is_public === false
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export default async function HandleProfilePage({ params }: Props) {
  const { handle } = await params;

  // v5.1: handle이 의사 slug와 일치하면 → /doctors/{slug}로 308 redirect (canonical 통일)
  // 원장 official 페이지는 /doctors/{slug}만 — /{slug}로는 진입 X
  const supabase = await createSupabaseServerClient();
  const { data: doctorMatch } = await supabase
    .from("doctors")
    .select("slug")
    .eq("slug", handle)
    .maybeSingle();
  if (doctorMatch) redirect(`/doctors/${handle}`);

  const result = await fetchProfileByHandle(handle);
  if (!result) notFound();
  const { profile, isAlt, identity } = result;

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  // Phase 9: 같은 auth_user_id 묶음이면 본인 (다른 ID여도 같은 사람)
  // - 본인 auth user의 메인 profile 접근: profile.id === viewer.id
  // - 본인 묶음 다른 profile 접근(부계정 등): profile.auth_user_id === viewer.id
  const profileAuthUserId = (profile as { auth_user_id?: string | null }).auth_user_id ?? null;
  const isOwner = !!viewer && (
    viewer.id === profile.id || profileAuthUserId === viewer.id
  );

  // 본인일 때 role 조회 — admin이 본인 1차 handle로 접근하면 /admin으로 redirect.
  // 단 personal identity handle(예: 배스킨 jminbae)로 접근한 경우엔 회원 프로필 그대로 노출.
  // (배정민 케이스: admin인데 배스킨으로 SNS 활동 — 그때는 일반 회원 화면이 맞음)
  let viewerRole: "admin" | "doctor" | "user" | null = null;
  if (isOwner && viewer) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    viewerRole =
      ((vp?.role as "admin" | "doctor" | "user" | undefined) ?? null) ?? null;
    // identity·alt_handle로 접근 시엔 redirect 안 함 (개인 페르소나 모드)
    if (viewerRole === "admin" && !identity && !isAlt) {
      redirect("/admin");
    }
  }

  // identity가 있으면 identity의 display_name/avatar/bio를 우선 (multi-identity)
  const displayName = identity
    ? identity.display_name
    : isAlt
      ? profile.alt_display_name ?? handle
      : profile.display_name ?? handle;
  const avatarUrl = identity
    ? identity.avatar_url
    : isAlt
      ? profile.alt_avatar_url
      : profile.avatar_url;
  const bio = identity ? identity.bio : isAlt ? profile.alt_bio : profile.bio;
  // identity가 doctor kind면 official, 아니면 personal로 글 필터
  const personaForPosts =
    identity?.kind === "doctor" || (!identity && !isAlt) ? "official" : "personal";

  // 작성 글 — 현재 페르소나로 작성한 published 글만, 최근 20개
  const { data: postsData } = await supabase
    .from("cards")
    .select(
      `
      id, question, answer, meta, keywords, type, created_at, posted_as,
      like_count, view_count, post_year, post_slug, shortcode,
      category, hide_doctor_credential,
      external_url, external_title, external_description, external_image, external_site_name,
      doctor:doctors(slug, name, branch),
      author:profiles!cards_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle),
      video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
    )
    .eq("author_id", profile.id)
    .eq("posted_as", personaForPosts)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<CardData[]>();

  const posts = postsData ?? [];

  // 댓글 카운트 prefetch (탭 미클릭 시에도 숫자 표시)
  const { count: commentsCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("posted_as", personaForPosts)
    .eq("status", "visible");

  // 좋아요/저장 카운트 prefetch — 본인 보기일 때만 (본인만 자기 likes/saves SELECT 가능)
  let likesCount = 0;
  let savesCount = 0;
  if (isOwner) {
    const [likesRes, savesRes] = await Promise.all([
      supabase
        .from("card_likes")
        .select("card_id", { count: "exact", head: true })
        .eq("user_id", profile.id),
      supabase
        .from("card_saves")
        .select("card_id", { count: "exact", head: true })
        .eq("user_id", profile.id),
    ]);
    likesCount = likesRes.count ?? 0;
    savesCount = savesRes.count ?? 0;
  }

  // viewer prefetch — posts에 대한 좋아요/저장/평점
  const { fetchViewerStates } = await import("@/lib/viewer-states");
  const vsMap = await fetchViewerStates(
    supabase,
    viewer?.id ?? null,
    posts.map((p) => p.id),
  );
  const viewerStates: Record<number, { liked?: boolean; saved?: boolean; rating?: number }> = {};
  for (const [id, st] of vsMap) viewerStates[id] = st;

  return (
    <section className="w-full py-6">
      {/* 프로필 헤더 — 사진 가운데, 카드 wrapper 없이 */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="h-[128px] w-[128px] overflow-hidden rounded-full bg-[var(--bg-soft)] sm:h-[144px] sm:w-[144px]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              // doctor 누끼 사진은 상반신 — 작은 원형에서 얼굴이 잘리지 않도록 위쪽으로 정렬
              style={
                identity?.doctor_id
                  ? { objectPosition: "50% 12%" }
                  : undefined
              }
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-[var(--text-muted)]">
              👤
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <h1 className="text-xl font-bold text-[var(--text)]">
            {displayName}
          </h1>
          {isAlt && (
            <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              개인 모드
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-[var(--text-muted)]">@{handle}</div>
        {bio && (
          <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            {bio}
          </p>
        )}
        {isOwner && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            <Link
              href="/settings/profile"
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              ✏️ 프로필 수정
            </Link>
            {/* admin은 위에서 /admin으로 redirect 되므로 여기 도달 X */}
          </div>
        )}

        {/* 피부 정보는 [피부고민] 탭으로 이동됨 */}
      </div>

      {/* 탭 — 작성 글 / 피부고민 / 댓글 / 좋아요(owner) / 저장(owner) */}
      <ProfileTabs
        posts={posts}
        postsCount={posts.length}
        commentsCount={commentsCount ?? 0}
        likesCount={likesCount}
        savesCount={savesCount}
        isOwner={isOwner}
        profileId={profile.id}
        personaForPosts={personaForPosts}
        skinInfo={{
          faceShape: profile.face_shape,
          skinType: profile.skin_type,
          skinConcerns: profile.skin_concerns ?? [],
          interestedProcedures: profile.interested_procedures ?? [],
          likedProcedures: profile.liked_procedures ?? [],
          visibility: (profile.field_visibility ?? {}) as Record<string, boolean>,
        }}
        viewerStates={viewerStates}
      />

      {/* 본인 접속 시 페이지 최하단에 로그아웃 (탈퇴는 /settings/profile에 유지) */}
      {isOwner && (
        <div className="mt-12 flex justify-center border-t border-[var(--border)] pt-6">
          <LogoutButton />
        </div>
      )}
    </section>
  );
}

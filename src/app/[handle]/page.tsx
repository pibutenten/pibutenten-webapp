import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type QACardData } from "@/components/QACard";
import ProfileTabs from "@/components/ProfileTabs";
import { SITE_URL } from "@/lib/site";
import type { UserRole } from "@/lib/user-grades";

export const dynamic = "force-dynamic";

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
async function fetchProfileByHandle(
  handle: string,
): Promise<{ profile: ProfileRow; isAlt: boolean } | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle)) return null;
  const supabase = await createSupabaseServerClient();
  // 1) handle 매칭
  let { data } = await supabase
    .from("profiles")
    .select(
      "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, bio, avatar_url, is_public, created_at, handle, alt_handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, field_visibility",
    )
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (data) return { profile: data, isAlt: false };

  // 2) alt_handle 매칭
  ({ data } = await supabase
    .from("profiles")
    .select(
      "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, bio, avatar_url, is_public, created_at, handle, alt_handle, birthdate, gender, face_shape, skin_type, skin_concerns, interested_procedures, liked_procedures, field_visibility",
    )
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
  const { profile, isAlt } = result;
  const name = isAlt
    ? profile.alt_display_name ?? handle
    : profile.display_name ?? handle;
  const bio = isAlt ? profile.alt_bio : profile.bio;
  return {
    title: `${name} (@${handle})`,
    description: bio ?? `${name}의 피부텐텐 프로필`,
    alternates: { canonical: `${SITE_URL}/${handle}` },
    robots: profile.is_public === false
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export default async function HandleProfilePage({ params }: Props) {
  const { handle } = await params;
  const result = await fetchProfileByHandle(handle);
  if (!result) notFound();
  const { profile, isAlt } = result;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const isOwner = viewer?.id === profile.id;

  // 본인일 때 role 조회 — admin이면 본인 프로필 안 보여주고 /admin으로 redirect
  // (관리자는 본인 명의로 글 안 씀 — 의사 명의 검수 흐름만)
  let viewerRole: "admin" | "doctor" | "user" | null = null;
  if (isOwner && viewer) {
    const { data: vp } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", viewer.id)
      .maybeSingle();
    viewerRole =
      ((vp?.role as "admin" | "doctor" | "user" | undefined) ?? null) ?? null;
    if (viewerRole === "admin") {
      redirect("/admin");
    }
  }

  const displayName = isAlt
    ? profile.alt_display_name ?? handle
    : profile.display_name ?? handle;
  const avatarUrl = isAlt ? profile.alt_avatar_url : profile.avatar_url;
  const bio = isAlt ? profile.alt_bio : profile.bio;
  const personaForPosts = isAlt ? "personal" : "official";

  // 작성 글 — 현재 페르소나로 작성한 published 글만, 최근 20개
  const { data: postsData } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords, type, created_at, posted_as,
      like_count, view_count, post_year, post_slug, shortcode,
      category, hide_doctor_credential,
      external_url, external_title, external_description, external_image, external_site_name,
      doctor:doctors(slug, name, branch),
      author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle),
      video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
    )
    .eq("author_id", profile.id)
    .eq("posted_as", personaForPosts)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<QACardData[]>();

  const posts = postsData ?? [];

  // 댓글 카운트 prefetch (탭 미클릭 시에도 숫자 표시)
  const { count: commentsCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("posted_as", personaForPosts)
    .eq("status", "visible");

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
              href="/me/profile"
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              ✏️ 프로필 수정
            </Link>
            {/* admin은 위에서 /admin으로 redirect 되므로 여기 도달 X */}
          </div>
        )}

        {/* 공개된 피부 정보 — 본인이 [공개] 체크한 항목만 표시 */}
        {(() => {
          const v = profile.field_visibility ?? {};
          const items: string[] = [];
          if (v.face_shape !== false && profile.face_shape) {
            const FACE_LABEL: Record<string, string> = {
              oval: "달걀형", peanut: "땅콩형", oblong: "장방형",
              square: "각진형", round: "둥근형",
            };
            items.push(`얼굴 ${FACE_LABEL[profile.face_shape] ?? profile.face_shape}`);
          }
          if (v.skin_type !== false && profile.skin_type) {
            const SKIN_LABEL: Record<string, string> = {
              extreme_dry: "극건성", dry: "건성", normal: "중성",
              combination: "복합성", dehydrated_oily: "수부지",
              oily: "지성", extreme_oily: "극지성",
            };
            items.push(SKIN_LABEL[profile.skin_type] ?? profile.skin_type);
          }
          if (v.skin_concerns !== false && profile.skin_concerns?.length) {
            const CON_LABEL: Record<string, string> = {
              elasticity: "탄력", volume: "볼륨", wrinkle: "주름",
              tone: "피부톤", pores: "모공", contour: "윤곽",
              texture: "피부결", aging: "노안", trouble: "트러블",
              sensitive: "민감성",
            };
            items.push(
              ...profile.skin_concerns
                .slice(0, 4)
                .map((c) => `#${CON_LABEL[c] ?? c}`),
            );
          }
          if (
            v.interested_procedures !== false &&
            profile.interested_procedures?.length
          ) {
            const PROC_LABEL: Record<string, string> = {
              lifting: "리프팅", laser: "피부레이저", booster: "스킨부스터",
              botox: "보톡스", filler: "필러", cosmetic: "화장품",
            };
            items.push(
              ...profile.interested_procedures
                .slice(0, 4)
                .map((p) => `${PROC_LABEL[p] ?? p}에 관심`),
            );
          }
          if (v.liked_procedures !== false && profile.liked_procedures?.length) {
            items.push(
              ...profile.liked_procedures
                .slice(0, 5)
                .map((l) => `❤ ${l}`),
            );
          }
          if (items.length === 0) return null;
          return (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {items.map((it, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[var(--bg-soft)] px-2.5 py-0.5 text-[11.5px] text-[var(--text-secondary)]"
                >
                  {it}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 탭 — 작성 글 / 댓글 / 좋아요(owner) / 저장(owner). 작성 글 탭은 2단 QAFeed. */}
      <ProfileTabs
        posts={posts}
        postsCount={posts.length}
        commentsCount={commentsCount ?? 0}
        likesCount={0}
        savesCount={0}
        isOwner={isOwner}
        profileId={profile.id}
        personaForPosts={personaForPosts}
      />
    </section>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
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
      "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, bio, avatar_url, is_public, created_at, handle, alt_handle",
    )
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow>();
  if (data) return { profile: data, isAlt: false };

  // 2) alt_handle 매칭
  ({ data } = await supabase
    .from("profiles")
    .select(
      "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, bio, avatar_url, is_public, created_at, handle, alt_handle",
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

  return (
    <section className="w-full py-6">
      {/* 프로필 헤더 */}
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text)]">
                {displayName}
              </h1>
              <span className="text-sm text-[var(--text-muted)]">@{handle}</span>
              {isAlt && (
                <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  개인 모드
                </span>
              )}
            </div>
            {bio && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {bio}
              </p>
            )}
            {isOwner && (
              <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                <Link
                  href="/me/profile"
                  className="rounded border border-[var(--border)] px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                >
                  ✏️ 프로필 수정
                </Link>
                <Link
                  href="/me"
                  className="rounded border border-[var(--border)] px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
                >
                  대시보드
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 작성 글 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          작성 글 ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text-muted)]">
            아직 작성한 글이 없어요
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((qa) => (
              <QACard key={qa.id} qa={qa} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

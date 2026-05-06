import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import {
  ROLE_LABELS,
  LEVEL_LABELS,
  LEVEL_COLORS,
  type UserRole,
  type UserLevel,
} from "@/lib/user-grades";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: UserRole;
  level: UserLevel;
  activity_score: number;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  created_at: string;
};

export default async function PublicUserProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, role, level, activity_score, bio, avatar_url, is_public, created_at",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) notFound();

  // 원장님이면 /doctors/{slug}로 리다이렉트
  if (profile.role === "doctor") {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor:doctors(slug)")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .returns<{ doctor: { slug: string } | null }>();
    if (da?.doctor?.slug) redirect(`/doctors/${da.doctor.slug}`);
  }

  // 비공개 프로필 — 본인이 아니면 차단
  const isOwner = viewer?.id === profile.id;
  if (profile.is_public === false && !isOwner) {
    return (
      <section className="w-full py-10 text-center">
        <div className="mx-auto max-w-[400px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-8">
          <div className="mb-3 text-3xl">🔒</div>
          <h1 className="text-lg font-bold text-[var(--text)]">
            비공개 프로필
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            이 사용자는 프로필을 비공개로 설정했습니다.
          </p>
        </div>
      </section>
    );
  }

  // 사용자가 작성한 published post 가져오기
  const { data: posts } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords, type, created_at,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      author:profiles!qas_author_id_fkey(id, display_name, avatar_url),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("author_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<QACardData[]>();

  const lvlColor = LEVEL_COLORS[profile.level] ?? LEVEL_COLORS[0];
  const postList = posts ?? [];

  return (
    <section className="w-full py-6">
      {/* 헤더 카드 */}
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
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
                {profile.display_name ?? "익명"}
              </h1>
              <span className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text)]">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
              {profile.role === "user" && profile.level > 0 && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: lvlColor.bg, color: lvlColor.fg }}
                >
                  {LEVEL_LABELS[profile.level]}
                </span>
              )}
            </div>
            {profile.bio && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                {profile.bio}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>
                가입일 {profile.created_at?.slice(0, 10) ?? "-"}
              </span>
              {profile.role === "user" && (
                <span>활동점수 {profile.activity_score.toLocaleString()}</span>
              )}
              <span>작성 글 {postList.length}</span>
            </div>
          </div>
          {isOwner && (
            <Link
              href="/me/profile"
              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              내 정보 수정
            </Link>
          )}
        </div>
      </div>

      {/* 작성 글 */}
      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
        {profile.display_name ?? "이 사용자"}의 글{" "}
        <span className="text-[14px] font-medium text-[var(--text-muted)]">
          {postList.length}
        </span>
      </h2>

      {postList.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          아직 작성한 글이 없어요.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {postList.map((q) => (
            <QACard key={q.id} qa={q} />
          ))}
        </div>
      )}
    </section>
  );
}

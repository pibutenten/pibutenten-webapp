import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import type { UserRole, UserLevel } from "@/lib/user-grades";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  alt_display_name: string | null;
  alt_avatar_url: string | null;
  alt_bio: string | null;
  role: UserRole;
  level: UserLevel;
  activity_score: number;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  created_at: string;
};

export default async function PublicUserProfilePage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const { p: personaParam } = await searchParams;
  const isPersonalView = personaParam === "personal";
  const supabase = await createSupabaseServerClient();

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, alt_display_name, alt_avatar_url, alt_bio, role, level, activity_score, bio, avatar_url, is_public, created_at",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ProfileRow>();

  if (!profile) notFound();

  // 원장님이면 /doctors/{slug}로 리다이렉트 — 단, ?p=personal로 들어오면 개인 페르소나 페이지를 그대로 표시
  if (profile.role === "doctor" && !isPersonalView) {
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

  // 사용자가 작성한 글
  // - doctor/admin: 페르소나 분리 (공식/개인 필터)
  // - 일반 user: 페르소나 개념 없음 → 전부 표시
  // - 본인 본인 페이지를 보면 모든 status, 다른 사람이 보면 published만
  const profileHasPersonaSeparation =
    profile.role === "doctor" || profile.role === "admin";
  let postsQuery = supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords, type, status, created_at, posted_as,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("author_id", profile.id);
  if (!isOwner) {
    postsQuery = postsQuery.eq("status", "published");
  }
  if (profileHasPersonaSeparation) {
    postsQuery = postsQuery.eq(
      "posted_as",
      isPersonalView ? "personal" : "official",
    );
  }
  const { data: posts, error: postsError } = await postsQuery
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<QACardData[]>();

  // 디버깅: 콘솔에 결과 로깅 (server console / Vercel logs에 출력)
  if (postsError) {
    console.error("[/u/[id]] posts query error:", postsError);
  }
  console.log(
    `[/u/[id]] profile.id=${profile.id} role=${profile.role} isOwner=${isOwner} count=${posts?.length ?? 0}`,
  );

  const postList = posts ?? [];

  // 받은 좋아요 / 받은 댓글 합계
  const totalLikes = postList.reduce((s, q) => s + (q.like_count ?? 0), 0);
  // 받은 댓글 수 (자기 댓글 제외)
  let totalComments = 0;
  if (postList.length > 0) {
    const ids = postList.map((q) => q.id);
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .in("qa_id", ids)
      .neq("author_id", profile.id)
      .eq("status", "visible");
    totalComments = count ?? 0;
  }

  // 가입한 지 N일
  const daysSince = profile.created_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(profile.created_at).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  // 페르소나별 표시 정보
  const headerAvatar = isPersonalView
    ? profile.alt_avatar_url
    : profile.avatar_url;
  const headerName = isPersonalView
    ? profile.alt_display_name ?? "익명"
    : profile.display_name ?? "익명";
  const headerBio = isPersonalView ? profile.alt_bio : profile.bio;
  const showDoctorLabel = profile.role === "doctor" && !isPersonalView;

  return (
    <section className="w-full py-6">
      {/* 헤더 — 큰 아바타 가운데 정렬, 인스타·미디엄 톤 */}
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative h-[88px] w-[88px] overflow-hidden rounded-full bg-[var(--bg-soft)] shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            {headerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerAvatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-muted)]">
                👤
              </div>
            )}
          </div>
          <h1 className="mt-3 text-xl font-bold text-[var(--text)]">
            {headerName}
            {showDoctorLabel && (
              <span className="ml-1 text-sm font-medium text-[var(--text-secondary)]">
                원장님
              </span>
            )}
            {isPersonalView && (
              <span className="ml-1.5 align-middle text-[11px] font-medium text-[var(--text-muted)]">
                · 개인
              </span>
            )}
          </h1>
          {headerBio ? (
            <p className="mt-2 max-w-[480px] whitespace-pre-wrap text-sm leading-[1.6] text-[var(--text-secondary)]">
              {headerBio}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {isOwner
                ? "프로필 소개를 추가하면 다른 사용자에게 더 잘 보여요."
                : "아직 소개가 없어요."}
            </p>
          )}

          {isOwner && (
            <Link
              href="/me/profile"
              className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              내 정보 수정
            </Link>
          )}
        </div>

        {/* 통계 — 가로 4분할 (모바일 4col, 컴팩트 inline 형식) */}
        <div className="mt-5 grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-4">
          <UserStat label="작성 글" value={postList.length} />
          <UserStat label="받은 좋아요" value={totalLikes} />
          <UserStat label="받은 댓글" value={totalComments} />
          <UserStat label="가입" value={daysSince} suffix="일" />
        </div>
      </div>

      {/* 작성 글 — 박스보다 살짝 안쪽 들여쓰기 */}
      <h2 className="mb-3 px-2 text-lg font-bold text-[var(--text)]">
        {headerName}의 글{" "}
        <span className="text-[14px] font-medium text-[var(--text-muted)]">
          {postList.length}
        </span>
      </h2>

      {postList.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-10 text-center">
          <div className="mb-3 text-4xl">📝</div>
          <p className="text-sm text-[var(--text-secondary)]">
            {isOwner ? (
              <>
                첫 글을 남겨보세요.{" "}
                <Link
                  href="/write"
                  className="font-semibold text-[var(--primary)] hover:underline"
                >
                  글쓰기 →
                </Link>
              </>
            ) : (
              "아직 작성한 글이 없어요."
            )}
          </p>
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

function UserStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
        {suffix && (
          <span className="ml-0.5 text-xs font-medium text-[var(--text-muted)]">
            {suffix}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

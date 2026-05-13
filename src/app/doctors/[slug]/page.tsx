import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import { getHotQaIds } from "@/lib/hot-ids";
import Feed from "@/components/Feed";
import type { QACardData } from "@/components/QACard";
import { SITE_URL } from "@/lib/site";
import {
  asDoctorProfileData,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import { buildDoctorFull } from "@/lib/schema/doctor";
import { PopularSearchesCard, PopularTagsCard } from "@/app/admin/PopularCards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Props = {
  params: Promise<{ slug: string }>;
};

/** 원장님 페이지 공유 시 OG 메타 — /public/og/{slug}.png 우선, 없으면 기본 og.png */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("name, title, clinic, intro")
    .eq("slug", slug)
    .maybeSingle()
    .returns<{ name: string; title: string; clinic: string; intro: string | null }>();
  if (!doctor) return {};
  const ogImage = `/og/${slug}.png`;
  // v5.1: 병원명 제거. 사이트명은 layout template이 prefix로 자동 추가 ("피부텐텐 | …")
  const title = `${doctor.name} · ${doctor.title}`;
  const description =
    doctor.intro?.trim() ||
    `${doctor.name} ${doctor.title}의 피부 Q&A와 칼럼을 만나보세요. 피부텐텐.`;
  const canonical = `${SITE_URL}/doctors/${slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: doctor.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

type Doctor = {
  id: string;
  slug: string;
  name: string;
  title: string;
  clinic: string;
  branch: string | null;
  intro: string | null;
  profile_data: unknown; // JSONB → DoctorProfileData
};

export default async function DoctorDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, slug, name, title, clinic, branch, intro, profile_data")
    .eq("slug", slug)
    .maybeSingle()
    .returns<Doctor>();

  if (!doctor) notFound();
  const profile: DoctorProfileData = asDoctorProfileData(doctor.profile_data);

  // RPC로 가져와서 검색어 없을 때도 ±14일 랜덤 셔플 (홈 피드와 동일)
  const rpcRes = await supabase.rpc("search_qas_scored", {
    p_q: "",
    p_doctor_slug: doctor.slug,
    p_offset: 0,
    p_limit: PAGE_SIZE,
    p_boost_doctor_slug: null,
  });
  const qas = (rpcRes.data ?? []) as QACardData[];
  // 카운트는 별도 쿼리
  const cRes = await supabase
    .from("qas")
    .select("id", { count: "exact", head: true })
    .eq("published", true)
    .eq("doctor_id", doctor.id);
  const count = cRes.count ?? null;

  // viewer prefetch
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const { fetchViewerStates } = await import("@/lib/viewer-states");
  const vsMap = await fetchViewerStates(
    supabase,
    viewer?.id ?? null,
    qas.map((q) => q.id),
  );
  const viewerStates: Record<number, { liked?: boolean; saved?: boolean; rating?: number }> = {};
  for (const [id, st] of vsMap) viewerStates[id] = st;

  const photo = getDoctorPhoto(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");
  const hotIds = Array.from(await getHotQaIds(20));

  // 본인 접속 판단 — viewer가 doctor_accounts로 매핑된 본인 doctor인지
  let isOwner = false;
  let ownerStats: {
    publishedQa: number;
    pendingReview: number;
    publishedPost: number;
    draft: number;
    receivedComments: number;
    receivedLikes: number;
    receivedSaves: number;
    receivedShares: number;
  } | null = null;
  if (viewer) {
    const { data: da } = await supabase
      .from("doctor_accounts")
      .select("doctor_id")
      .eq("profile_id", viewer.id)
      .eq("doctor_id", doctor.id)
      .maybeSingle();
    if (da) {
      isOwner = true;
      // 8개 KPI: 글 상태별 카운트(4) + 받은 인터랙션 합산(4)
      // 누적 카운트 기준. 기간 토글은 다음 세션 RPC 작업으로 분리됨.
      const [pubQa, pen, pubPost, drf, sumsRes] = await Promise.all([
        supabase
          .from("qas")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctor.id)
          .eq("type", "qa")
          .eq("status", "published"),
        supabase
          .from("qas")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctor.id)
          .eq("status", "pending_review"),
        supabase
          .from("qas")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctor.id)
          .eq("type", "post")
          .eq("status", "published"),
        supabase
          .from("qas")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctor.id)
          .eq("status", "draft"),
        supabase
          .from("qas")
          .select("like_count, save_count, share_count, comment_count")
          .eq("doctor_id", doctor.id)
          .eq("status", "published"),
      ]);
      type SumRow = {
        like_count: number | null;
        save_count: number | null;
        share_count: number | null;
        comment_count: number | null;
      };
      const sums = ((sumsRes.data ?? []) as SumRow[]).reduce(
        (acc, r) => ({
          likes: acc.likes + (r.like_count ?? 0),
          saves: acc.saves + (r.save_count ?? 0),
          shares: acc.shares + (r.share_count ?? 0),
          comments: acc.comments + (r.comment_count ?? 0),
        }),
        { likes: 0, saves: 0, shares: 0, comments: 0 },
      );
      ownerStats = {
        publishedQa: pubQa.count ?? 0,
        pendingReview: pen.count ?? 0,
        publishedPost: pubPost.count ?? 0,
        draft: drf.count ?? 0,
        receivedComments: sums.comments,
        receivedLikes: sums.likes,
        receivedSaves: sums.saves,
        receivedShares: sums.shares,
      };
    }
  }

  // 본인 접속 시 — 인기 검색어/태그 6개 기간 prefetch (admin 대시보드와 동일)
  // 기간 토글 6종 통일: 24시간/7일/30일/90일/1년/전체
  const POPULAR_DAYS = [1, 7, 30, 90, 365, 0] as const;
  type SearchRow = { query: string; cnt: number };
  type TagRow = { keyword: string; cnt: number };
  const searchesByDays: Record<number, SearchRow[]> = {};
  const tagsByDays: Record<number, TagRow[]> = {};
  if (isOwner) {
    const [searchResults, tagResults] = await Promise.all([
      Promise.all(
        POPULAR_DAYS.map((d) =>
          supabase.rpc("get_top_search_queries", { p_days: d || 36500, p_limit: 10 }),
        ),
      ),
      Promise.all(
        POPULAR_DAYS.map((d) =>
          supabase.rpc("get_top_tags", { p_days: d, p_min_count: 1, p_limit: 10 }),
        ),
      ),
    ]);
    POPULAR_DAYS.forEach((d, i) => {
      searchesByDays[d] = (searchResults[i]?.data ?? []) as SearchRow[];
      tagsByDays[d] = ((tagResults[i]?.data ?? []) as TagRow[]).slice(0, 10);
    });
  }

  // 본인 접속 시 — 내 글에 달린 최근 댓글 (처리해야 할 것들)
  type RecentCommentRow = {
    id: number;
    qa_id: number;
    body: string;
    created_at: string;
    author: {
      display_name: string | null;
      avatar_url: string | null;
      handle: string | null;
    } | null;
    qa: { question: string; shortcode: string | null } | null;
  };
  let recentComments: RecentCommentRow[] = [];
  if (isOwner) {
    const { data: rc } = await supabase
      .from("comments")
      .select(
        `id, qa_id, body, created_at,
         author:profiles!comments_author_id_fkey(display_name, avatar_url, handle),
         qa:qas!inner(question, shortcode, doctor_id)`,
      )
      .eq("qa.doctor_id", doctor.id)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(10);
    recentComments = ((rc ?? []) as unknown) as RecentCommentRow[];
  }

  // JSON-LD: Physician(풀세트, multi-typing) + BreadcrumbList — 헬퍼로 중앙화 (변경 1·2·4·6)
  const SITE = SITE_URL;
  const physicianLd = buildDoctorFull({
    slug: doctor.slug,
    name: doctor.name,
    title: doctor.title,
    intro: doctor.intro,
    profile_data: doctor.profile_data,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      physicianLd,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "피부텐텐",
            item: `${SITE}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "전문의",
            item: `${SITE}/doctors`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${doctor.name} ${doctor.title}`,
          },
        ],
      },
    ],
  };

  // 본인 접속 시 — 외부인용 프로필 화면 모두 숨기고 대시보드만 렌더 (사용자 요청)
  if (isOwner && ownerStats) {
    return (
      <section className="space-y-5 py-2">
        <div className="mb-1">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            {doctor.name} 원장님 대시보드
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            본인 전용 — 통계·글 관리·받은 댓글
          </p>
        </div>

        <DoctorOwnerWidget
          doctorSlug={doctor.slug}
          stats={ownerStats}
        />

        {/* 대시보드 메뉴 (관리자 대시보드와 동일 패턴) */}
        <DoctorOpsTools doctorSlug={doctor.slug} />

        {/* 받은 댓글 — 최근 10개 */}
        <DoctorCommentsWidget comments={recentComments} doctorSlug={doctor.slug} />

        {/* 인기 검색어·태그 — admin 대시보드와 동일 (글로벌 데이터, 6개 기간 prefetch) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PopularSearchesCard initialDays={7} dataByDays={searchesByDays} />
          <PopularTagsCard initialDays={0} dataByDays={tagsByDays} />
        </div>

        {/* 공개 프로필 미리보기 링크 */}
        <p className="text-center text-[11px] text-[var(--text-muted)]">
          외부인이 보는 공개 프로필은{" "}
          <Link
            href={`/doctors/${doctor.slug}?preview=public`}
            className="hover:text-[var(--primary)] hover:underline"
          >
            미리보기
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* 원장님 hero
          모바일: 인트로 멘트가 페이지 폭을 가득 차지하며 데스크탑처럼 줄바꿈 유지.
                  멘트는 곡선 따옴표("…")로 감싸고, 사진은 그 아래 정중앙.
                  이름/소속은 사진 위쪽 여백에 안 겹치게.
          데스크탑: 기존 좌-멘트 + 우-사진 2단 구조 유지. */}
      <header className="relative -mx-4 -mt-6 w-[calc(100%+2rem)] overflow-hidden sm:mx-0 sm:-mt-4 sm:w-full sm:rounded-t-[var(--radius)]">
        {/* 모바일 레이아웃 — 멘트 가운데(따옴표 wrap), 사진 정중앙 */}
        <div className="mx-auto flex max-w-[820px] flex-col px-5 pt-12 sm:hidden">
          {doctor.intro && (
            // 데스크탑처럼 \n 줄바꿈 유지 + 좀 더 넓은 사용 (max-w 없음).
            // 시작·끝 곡선 따옴표("…")로 감싸기 — 인용문 느낌.
            <p className="whitespace-pre-line text-center text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              {`\u201C${doctor.intro}\u201D`}
            </p>
          )}
          {/* 이름·소속 — 사진 윗부분 여백에 놓이도록 사진 위에 배치 */}
          <div className="mt-6 text-center">
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {doctor.name}
            </h1>
            <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)]">
              {affiliation}
            </p>
          </div>
          {/* 사진 — 정중앙 배치, 사이즈 살짝 키움 */}
          <div className="relative mx-auto mt-3 h-[380px] w-[230px]">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="230px"
              className="object-contain object-bottom"
              priority
            />
          </div>
        </div>

        {/* 데스크탑 레이아웃 — 기존 그대로 (좌-멘트 / 우-사진) */}
        <div className="mx-auto hidden max-w-[820px] items-end gap-3 pl-6 pr-3 pt-10 sm:flex">
          <div className="flex flex-1 flex-col self-stretch pb-8 pt-16">
            {doctor.intro && (
              <p className="whitespace-pre-line text-[16px] leading-[1.7] text-[var(--text-secondary)]">
                {doctor.intro}
              </p>
            )}
            <div className="mt-auto pt-5">
              <h1 className="text-3xl font-bold text-[var(--text)]">
                {doctor.name}
              </h1>
              <p className="mt-1 text-[14px] font-medium text-[var(--text-secondary)]">
                {affiliation}
              </p>
            </div>
          </div>

          {/* 우측: 누끼 사진 */}
          <div className="relative h-[450px] w-[270px] shrink-0">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="270px"
              className="object-contain object-bottom"
              priority
            />
          </div>
        </div>
      </header>

      {/* 프로필 강화 섹션 — profile_data에 입력된 항목만 노출 (E-E-A-T 신뢰 신호)
          (본인 접속은 위에서 dashboard-only 화면으로 분기됨 — 여기 도달 X) */}
      <DoctorProfileSection profile={profile} />

      {/* 원장 칼럼 섹션은 비공개 — 카드 포스팅으로 통일.
          기존 article 데이터는 보존되지만 새 글 작성·노출 진입점은 모두 제거. */}

      {/* Q&A 헤더 — “답변 N편” 표기 + 좌측 살짝 인덴트 */}
      <h2 className="pl-2 pt-2 text-lg font-bold text-[var(--text)]">
        {doctor.name} 원장님의 답변{" "}
        <span className="text-[14px] font-medium text-[var(--text-muted)]">
          {count ?? 0}편
        </span>
      </h2>

      {/* Q&A 피드 (해당 원장만) */}
      {!qas || qas.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          아직 등록된 Q&A가 없어요.
        </div>
      ) : (
        <Feed
          initial={qas}
          pageSize={PAGE_SIZE}
          doctorSlug={doctor.slug}
          hotIds={hotIds}
          viewerStates={viewerStates}
          key={doctor.slug}
        />
      )}
    </section>
  );
}

/**
 * 원장 본인 접속 시 표시되는 대시보드 위젯.
 * - 글 상태별 카운트 + 받은 인터랙션 합산
 * - 빠른 작성 버튼 (Q&A·꿀팁·공유하기)
 * - 외부인엔 노출 X
 */
function DoctorOwnerWidget({
  doctorSlug,
  stats,
}: {
  doctorSlug: string;
  stats: {
    publishedQa: number;
    pendingReview: number;
    publishedPost: number;
    draft: number;
    receivedComments: number;
    receivedLikes: number;
    receivedSaves: number;
    receivedShares: number;
  };
}) {
  return (
    <div>
      {/* 8개 KPI — 모바일 4×2 / 데스크탑 8 한 줄. 각 카드 클릭 시 해당 필터로 이동.
          누적 카운트 기준 — 기간 토글은 별도 RPC 작업으로 분리됨. */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        <Stat
          label="발행 Q&A"
          value={stats.publishedQa}
          href={`/admin/qas?doctor=${doctorSlug}&type=qa&status=published`}
        />
        <Stat
          label="검수 대기"
          value={stats.pendingReview}
          href={`/admin/qas?doctor=${doctorSlug}&status=pending_review`}
        />
        <Stat
          label="발행 포스팅"
          value={stats.publishedPost}
          href={`/admin/qas?doctor=${doctorSlug}&type=post&status=published`}
        />
        <Stat
          label="임시저장"
          value={stats.draft}
          href={`/admin/qas?doctor=${doctorSlug}&status=draft`}
        />
        <Stat
          label="받은 댓글"
          value={stats.receivedComments}
          href={`/admin/qas?doctor=${doctorSlug}&sort=comments`}
        />
        <Stat
          label="받은 좋아요"
          value={stats.receivedLikes}
          href={`/admin/qas?doctor=${doctorSlug}&sort=likes`}
        />
        <Stat
          label="받은 저장"
          value={stats.receivedSaves}
          href={`/admin/qas?doctor=${doctorSlug}&sort=saves`}
        />
        <Stat
          label="받은 공유"
          value={stats.receivedShares}
          href={`/admin/qas?doctor=${doctorSlug}&sort=shares`}
        />
      </div>
    </div>
  );
}

/**
 * 원장 본인 대시보드 — 메뉴 섹션 (admin 대시보드와 동일 패턴).
 * 내 글 관리·새 Q&A 추출 진입.
 */
function DoctorOpsTools({ doctorSlug }: { doctorSlug: string }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
        대시보드
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={`/admin/qas?doctor=${doctorSlug}`}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
        >
          <div className="text-[15px] font-bold text-[var(--text)]">
            📚 내 글 관리
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            Q&A·포스팅 검색·필터·발행/보관
          </p>
        </Link>
        <Link
          href="/write?type=qa"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
        >
          <div className="text-[15px] font-bold text-[var(--text)]">
            ✍️ Q&A 작성
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            새 Q&A 카드 하나 작성. URL(블로그·릴스·YouTube)로 첨부 가능
          </p>
        </Link>
      </div>
    </div>
  );
}

/**
 * 받은 댓글 위젯 — 내 글에 달린 최근 댓글 10개.
 * 본인 페이지(dashboard-only)에서만 노출.
 */
function DoctorCommentsWidget({
  comments,
  doctorSlug,
}: {
  comments: Array<{
    id: number;
    qa_id: number;
    body: string;
    created_at: string;
    author: {
      display_name: string | null;
      avatar_url: string | null;
      handle: string | null;
    } | null;
    qa: { question: string; shortcode: string | null } | null;
  }>;
  doctorSlug: string;
}) {
  if (comments.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
        <h2 className="mb-2 text-[14px] font-bold text-[var(--text)]">
          💬 받은 댓글
        </h2>
        <p className="text-[12px] text-[var(--text-muted)]">
          아직 댓글이 없어요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <h2 className="mb-3 text-[14px] font-bold text-[var(--text)]">
        💬 받은 댓글{" "}
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          (최근 {comments.length}개)
        </span>
      </h2>
      <ul className="space-y-3">
        {comments.map((c) => {
          const author = c.author;
          const name = author?.display_name ?? "익명";
          const initial = name.slice(0, 1);
          const target =
            author?.handle && c.qa?.shortcode
              ? `/${author.handle}/${c.qa.shortcode}`
              : `/doctors/${doctorSlug}`;
          return (
            <li key={c.id} className="flex items-start gap-2">
              {author?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatar_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full bg-[var(--bg-soft)] object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[11px] font-semibold text-[var(--text-secondary)]">
                  {initial}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-semibold text-[var(--text)]">
                    {name}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {relativeTime(c.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--text-secondary)]">
                  {c.body}
                </p>
                {c.qa?.question && (
                  <Link
                    href={target}
                    className="mt-1 inline-block truncate text-[11.5px] text-[var(--text-muted)] hover:text-[var(--primary)]"
                  >
                    ↳ {c.qa.question.slice(0, 60)}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <>
      <div className="text-[11px] font-medium text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-bold text-[var(--text)]">
        {value}
      </div>
    </>
  );
  const cls =
    "block rounded-[var(--radius-sm)] bg-white px-3 py-2 text-center transition-colors hover:bg-[var(--primary-soft)]";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/**
 * 의사 프로필 확장 섹션 — `profile_data` JSONB에 입력된 항목만 노출.
 * 학력·경력·전문분야·학회·외부채널을 표시 → E-E-A-T 신뢰 신호 + AEO 인용 친화.
 */
function DoctorProfileSection({ profile }: { profile: DoctorProfileData }) {
  // 좌측 컬럼: 학력 → 경력 → 전문 분야 (이력서 상단 흐름)
  const leftItems: { title: string; values: string[] }[] = [];
  if (profile.education && profile.education.length > 0)
    leftItems.push({ title: "학력", values: profile.education });
  if (profile.career && profile.career.length > 0)
    leftItems.push({ title: "경력", values: profile.career });
  if (profile.expertise && profile.expertise.length > 0)
    leftItems.push({ title: "전문 분야", values: profile.expertise });

  // 우측 컬럼: 학회 → 출판·저서 (소속/저작 신호)
  const rightItems: { title: string; values: string[] }[] = [];
  if (profile.memberOf && profile.memberOf.length > 0)
    rightItems.push({ title: "학회", values: profile.memberOf });
  if (profile.publications && profile.publications.length > 0)
    rightItems.push({ title: "출판·저서", values: profile.publications });

  // 외부 링크 — 병원 홈페이지·SNS 노출 우선순위 정렬
  const externalLinks: { label: string; url: string }[] = [];
  if (profile.clinicUrl)
    externalLinks.push({ label: "병원 홈페이지", url: profile.clinicUrl });
  if (profile.instagram)
    externalLinks.push({ label: "병원 인스타그램", url: profile.instagram });
  if (profile.threads)
    externalLinks.push({ label: "스레드", url: profile.threads });
  if (profile.youtube)
    externalLinks.push({ label: "YouTube", url: profile.youtube });
  if (profile.blog)
    externalLinks.push({ label: "블로그", url: profile.blog });

  if (
    leftItems.length === 0 &&
    rightItems.length === 0 &&
    externalLinks.length === 0
  )
    return null;

  return (
    <section className="relative z-10 -mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:-mt-8">
      <h2 className="mb-3 text-[15px] font-bold text-[var(--text)]">
        프로필
      </h2>
      {/* 모바일: 위→아래 단일 흐름(좌측 항목 후 우측 항목)
          데스크탑: 1장의 카드 안에서 좌·우 2컬럼 분할 */}
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {leftItems.length > 0 && (
          <ProfileDl items={leftItems} />
        )}
        {rightItems.length > 0 && (
          <ProfileDl items={rightItems} className="mt-2.5 sm:mt-0" />
        )}
      </div>
      {externalLinks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3 text-[12px]">
          {externalLinks.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileDl({
  items,
  className,
}: {
  items: { title: string; values: string[] }[];
  className?: string;
}) {
  return (
    <dl className={`space-y-2.5 ${className ?? ""}`}>
      {items.map((it) => (
        <div
          key={it.title}
          className="grid grid-cols-[52px_1fr] items-baseline gap-3 text-[13.5px] sm:grid-cols-[64px_1fr]"
        >
          <dt className="font-medium text-[var(--text-muted)]">{it.title}</dt>
          <dd className="text-[var(--text-secondary)]">
            {it.values.map((v, idx) => (
              <span key={`${it.title}-${idx}`} className="block leading-[1.7]">
                {v}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

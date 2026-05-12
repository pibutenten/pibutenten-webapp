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
    published: number;
    pending: number;
    draft: number;
    receivedLikes: number;
    receivedSaves: number;
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
      // 본인 글 상태별 카운트 + 받은 인터랙션 합산
      const [pub, pen, drf, likesRes, savesRes] = await Promise.all([
        supabase
          .from("qas")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctor.id)
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
          .eq("status", "draft"),
        supabase
          .from("qas")
          .select("like_count")
          .eq("doctor_id", doctor.id)
          .eq("status", "published"),
        supabase
          .from("qas")
          .select("save_count")
          .eq("doctor_id", doctor.id)
          .eq("status", "published"),
      ]);
      const totalLikes = (likesRes.data ?? []).reduce(
        (sum: number, r: { like_count: number | null }) =>
          sum + (r.like_count ?? 0),
        0,
      );
      const totalSaves = (savesRes.data ?? []).reduce(
        (sum: number, r: { save_count: number | null }) =>
          sum + (r.save_count ?? 0),
        0,
      );
      ownerStats = {
        published: pub.count ?? 0,
        pending: pen.count ?? 0,
        draft: drf.count ?? 0,
        receivedLikes: totalLikes,
        receivedSaves: totalSaves,
      };
    }
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
          doctorName={doctor.name}
          doctorSlug={doctor.slug}
          stats={ownerStats}
        />

        {/* 받은 댓글 — 최근 10개 */}
        <DoctorCommentsWidget comments={recentComments} doctorSlug={doctor.slug} />

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
      {/* 원장님 hero — 모바일에선 양옆/위 main padding 상쇄해서 viewport 가장자리까지 가득 */}
      <header className="relative -mx-4 -mt-6 w-[calc(100%+2rem)] overflow-hidden sm:mx-0 sm:-mt-4 sm:w-full sm:rounded-t-[var(--radius)]">
        {/* 좌측 padding을 ProfileSection 카드 안쪽 padding과 정렬 (모바일 40px / 데스크탑 24px)
            상단 여백 추가 — 헤더 바와 hero 콘텐츠 사이 호흡 확보 */}
        <div className="mx-auto flex max-w-[820px] items-end gap-2 pl-10 pr-4 pt-6 sm:gap-3 sm:pl-6 sm:pr-3 sm:pt-10">
          {/* 좌측: 멘트(중상단) + 이름(하단) — 좌측 여백은 부모 px-4로 일관 */}
          <div className="flex flex-1 flex-col self-stretch pb-5 pt-10 sm:pb-8 sm:pt-16">
            {doctor.intro && (
              <>
                {/* 모바일: \n 무시하고 페이지 폭에 맞춰 자동 wrap */}
                <p className="block text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:hidden">
                  {doctor.intro.replace(/\s*\n+\s*/g, " ")}
                </p>
                {/* 데스크탑: 입력된 \n 줄바꿈 그대로 유지 */}
                <p className="hidden whitespace-pre-line text-[16px] leading-[1.7] text-[var(--text-secondary)] sm:block">
                  {doctor.intro}
                </p>
              </>
            )}
            <div className="mt-auto pt-5">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {doctor.name}
              </h1>
              <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)] sm:text-[14px]">
                {affiliation}
              </p>
            </div>
          </div>

          {/* 우측: 누끼 사진 — 모바일도 시원하게, 우측 가장자리 안쪽으로 (translate 제거)
              사진 윗부분 여백 확보: 박스를 키우고 object-bottom 으로 하단 정렬 */}
          <div className="relative h-[340px] w-[195px] shrink-0 sm:h-[450px] sm:w-[270px]">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="(max-width: 600px) 195px, 270px"
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
  doctorName,
  doctorSlug,
  stats,
}: {
  doctorName: string;
  doctorSlug: string;
  stats: {
    published: number;
    pending: number;
    draft: number;
    receivedLikes: number;
    receivedSaves: number;
  };
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[var(--text)]">
          {doctorName} 원장님 대시보드
        </h2>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
          본인만 보임
        </span>
      </div>

      {/* 통계 5종 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="발행" value={stats.published} />
        <Stat label="검수 대기" value={stats.pending} />
        <Stat label="임시저장" value={stats.draft} />
        <Stat label="받은 좋아요" value={stats.receivedLikes} />
        <Stat label="받은 저장" value={stats.receivedSaves} />
      </div>

      {/* 빠른 작성·관리.
          원장 프로필 자체 수정은 관리자 영역(하드코딩) — 본 페이지에서 제거. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/write"
          className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--primary-dark)]"
        >
          ✏ 새 글 작성
        </Link>
        <Link
          href={`/admin/qas?doctor=${doctorSlug}`}
          className="rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          내 글 관리 →
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-white px-3 py-2 text-center">
      <div className="text-[11px] font-medium text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-bold text-[var(--text)]">
        {value}
      </div>
    </div>
  );
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

  // 우측 컬럼: 학회·소속 → 출판·저서 (소속/저작 신호)
  const rightItems: { title: string; values: string[] }[] = [];
  if (profile.memberOf && profile.memberOf.length > 0)
    rightItems.push({ title: "학회·소속", values: profile.memberOf });
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
          className="grid grid-cols-[80px_1fr] items-baseline gap-3 text-[13.5px] sm:grid-cols-[100px_1fr]"
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

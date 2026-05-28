import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { getHotQaIds } from "@/lib/hot-ids";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import {
  asDoctorProfileData,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import { buildDoctorFull } from "@/lib/schema/doctor";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";

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
  // v5.1: 병원명 제거. 사이트명은 layout template이 prefix로 자동 추가 ("피부텐텐 | …")
  const title = `${doctor.name} · ${doctor.title}`;
  const description =
    doctor.intro?.trim() ||
    `${doctor.name} ${doctor.title}의 피부 Q&A와 칼럼을 만나보세요. 피부텐텐.`;
  const canonical = `${SITE_URL}/doctors/${slug}`;
  // 2026-05-28: openGraph/twitter boilerplate 는 lib/og-meta.ts 헬퍼로 통합.
  return {
    title,
    description,
    alternates: { canonical },
    ...buildSocialMeta({
      title,
      description,
      canonical,
      ogImage: buildOgImage(slug),
      ogType: "profile",
      ogImageAlt: doctor.name,
    }),
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
  const rpcRes = await supabase.rpc("search_cards_scored", {
    p_q: "",
    p_doctor_slug: doctor.slug,
    p_offset: 0,
    p_limit: PAGE_SIZE,
    p_boost_doctor_slug: null,
  });
  const cards = (rpcRes.data ?? []) as CardData[];
  // 카운트는 별도 쿼리
  const cRes = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("doctor_id", doctor.id);
  const count = cRes.count ?? null;

  // viewer prefetch
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((q) => q.id),
  );

  const photo = getDoctorPhoto(doctor.slug);
  const theme = getDoctorTheme(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");
  const hotIds = Array.from(await getHotQaIds(20));

  // 정책 (2026-05-17): /doctors/[slug] 는 viewer 와 무관하게 동일한 공개 프로필만 노출.
  //   본인(의사) dashboard 는 /{handle} 페이지가 담당 — IdentitySwitcher 가 본인 진입 시
  //   /{handle} 로 라우팅. /doctors/[slug] 에는 dashboard 분기 없음.

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

  return (
    // pt-3 — 의도적으로 다른 페이지(`py-6`) 보다 BackButton 위치 높임.
    //         바로 아래 sky-blue hero 박스가 커서 윗 여백을 줄여야 시각적 균형이 맞음 (사용자 결정 2026-05-17).
    <section className="space-y-6 pt-3">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/doctors" />
      </div>
      {/* 원장님 hero
          모바일: 인트로 멘트가 페이지 폭을 가득 차지하며 데스크탑처럼 줄바꿈 유지.
                  멘트는 곡선 따옴표("…")로 감싸고, 사진은 그 아래 정중앙.
                  이름/소속은 사진 위쪽 여백에 안 겹치게.
          데스크탑: 기존 좌-멘트 + 우-사진 2단 구조 유지. */}
      <header
        // 모바일·데스크탑 모두 main 의 px-4 안쪽에 들어와 ProfileSection 과 좌우 폭 동일.
        // 이전: -mx-4 w-[calc(100%+2rem)] 로 viewport 가득 차게 했더니 모바일에서 사진 box
        // 와 그 아래 ProfileSection (px-6) 의 좌우 폭이 어긋남 → 통합 박스가 깨짐. 제거.
        className="relative overflow-hidden rounded-t-[var(--radius)]"
        style={{
          // 사용자 요청 — 은은하고 고급스러운 그라데이션.
          // 좌측 상단 원장 컬러(약 18%) → 우측 하단 흰색.
          // radial-gradient 로 어색한 banding 없이 부드럽게 페이드.
          // 모바일/데스크탑 동일 톤, 0.18 alpha 로 살짝만 (텍스트 가독성 유지).
          background: `
            radial-gradient(ellipse at 0% 0%, ${theme.bg}30 0%, transparent 55%),
            radial-gradient(ellipse at 100% 100%, ${theme.bg}1a 0%, transparent 60%),
            linear-gradient(180deg, ${theme.bg}10 0%, #ffffff 100%)
          `,
        }}
      >
        {/* 모바일 레이아웃 — 멘트 가운데(따옴표 wrap), 사진 정중앙.
            px-6: ProfileSection 의 px-6 과 동일 (모바일 통합 박스 좌우 폭 일치) */}
        <div className="mx-auto flex max-w-[820px] flex-col px-6 pt-12 sm:hidden">
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
              {/* 모바일 h1과 동일 텍스트 — SEO/스크린리더는 모바일 layout의 h1만 노출.
                  데스크탑은 시각 표시만 동일하게 (div, aria-hidden) — H1 중복 방지. */}
              <div
                aria-hidden="true"
                className="text-3xl font-bold text-[var(--text)]"
              >
                {doctor.name}
              </div>
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

      {/* 프로필 강화 섹션 — profile_data에 입력된 항목만 노출 (E-E-A-T 신뢰 신호).
          본인/외부인 분기 없음 — 모두 동일 공개 프로필. */}
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
      {!cards || cards.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          아직 등록된 Q&A가 없어요.
        </div>
      ) : (
        <Feed
          initial={cards}
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
    // 사진 header 와 위/아래 라운드를 분담해서 한 박스처럼 매끄럽게 잇기:
    //   header → rounded-t (위) / 사진 아래쪽은 직각으로 ProfileSection 과 맞붙음
    //   ProfileSection → rounded-b (아래) / 윗쪽은 직각으로 header 와 맞붙음
    // 부모 section 의 space-y-6 (24px) 이 header 와 ProfileSection 사이에 간격을 만들어
    // 틈이 생기므로 -mt-6 으로 그 간격을 정확히 0 으로 상쇄. 라운드는 분담돼 있어 통합 박스.
    <section className="relative z-10 -mt-6 rounded-b-[var(--radius)] bg-white px-6 py-4">
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

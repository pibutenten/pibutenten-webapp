import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Card, { type CardData } from "@/components/Card";
import BackButton from "@/components/BackButton";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { buildDoctorReference } from "@/lib/schema/doctor";
import { keywordsToAbout } from "@/lib/schema/procedure";
import { stripMarkdown } from "@/lib/strip-markdown";
import { jsonLdString } from "@/lib/json-ld";
import { CARD_DETAIL_SELECT } from "@/lib/card-select";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; year: string; postSlug: string }>;
};

const SITE = SITE_URL;

type QaWithModified = CardData & { updated_at?: string | null };

async function fetchQaByDoctorYearSlug(
  doctorSlug: string,
  year: number,
  postSlug: string,
): Promise<QaWithModified | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", doctorSlug)
      .maybeSingle();
    if (!doctor) return null;
    const { data } = await supabase
      .from("cards")
      .select(CARD_DETAIL_SELECT)
      .eq("doctor_id", doctor.id)
      .eq("post_year", year)
      .eq("post_slug", postSlug)
      .eq("status", "published")
      // 정책 (2026-05-15): doctor 라우트는 의사 Q&A canonical 만 노출.
      // 의사의 비-qa 카테고리 글 (diary/tip/ask/link) 은 회원 라우트로 분리됨.
      .eq("category", "qa")
      .maybeSingle()
      .returns<QaWithModified>();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year, postSlug } = await params;
  const yearInt = Number.parseInt(year, 10);
  if (!Number.isFinite(yearInt)) {
    return { title: "피부텐텐", robots: { index: false } };
  }
  const card = await fetchQaByDoctorYearSlug(slug, yearInt, postSlug);
  if (!card) return { title: "피부텐텐", robots: { index: false } };
  const docName = card.doctor?.name ? `${card.doctor.name} 원장님` : "피부텐텐";
  const desc = stripMarkdown(card.answer).slice(0, 110);
  const ogUrl = card.doctor?.slug ? `/og/${card.doctor.slug}.png` : `/og.png`;
  const canonical = `${SITE}/doctors/${slug}/${year}/${encodeURIComponent(postSlug)}`;
  return {
    title: card.question,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title: card.question,
      // description 은 답변 본문만 — title 영역에 이미 질문이 표시되고 원장 이름은
      // OG 이미지(profile photo + 직함 배지)에 노출되므로 prefix 중복 제거.
      // (이전 "정한미 원장님 — 답..." → 답변만 표시, 260518)
      description: desc,
      type: "article",
      url: canonical,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: docName }],
    },
    twitter: {
      card: "summary_large_image",
      title: card.question,
      description: desc,
      images: [ogUrl],
    },
  };
}

function buildJsonLd(
  card: QaWithModified,
  doctorSlug: string,
  year: number,
  postSlug: string,
) {
  const url = `${SITE}/doctors/${doctorSlug}/${year}/${encodeURIComponent(postSlug)}`;
  const created = card.created_at ?? new Date().toISOString();
  const modified = card.updated_at ?? created;
  const docName = card.doctor?.name ?? "";
  const answerText = stripMarkdown(card.answer);

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "피부텐텐", item: `${SITE}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: `${docName} 원장`,
        item: `${SITE}/doctors/${doctorSlug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${year}년`,
        item: `${SITE}/doctors/${doctorSlug}/${year}`,
      },
      { "@type": "ListItem", position: 4, name: card.question },
    ],
  };

  const physician = buildDoctorReference({
    slug: doctorSlug,
    name: docName,
  });

  // QAPage — 단일 질문 + 의사 검수 답변 + SNS 인터랙션 신호
  const medicalPage: Record<string, unknown> = {
    "@type": ["MedicalWebPage", "QAPage"],
    "@id": `${url}#webpage`,
    url,
    name: card.question,
    inLanguage: "ko-KR",
    datePublished: created,
    dateModified: modified, // cards.updated_at 활용 (AI freshness)
    lastReviewed: modified.slice(0, 10),
    reviewedBy: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
    isPartOf: { "@id": `${SITE}/#website` },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${SITE}/og/${doctorSlug}.png`,
    },
    // 게시 책임 주체 — 의료 페이지의 E-E-A-T 신호 강화 (MedicalOrganization).
    publisher: {
      "@type": ["Organization", "MedicalOrganization"],
      "@id": `${SITE}/about#org`,
      name: "주식회사 진솔컴퍼니",
      url: `${SITE}/about`,
      logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
    },
    // 음성/AI assistant가 두괄식 답안 첫 단락을 우선 픽업하도록 마킹.
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".card-answer-speakable"],
    },
    mainEntity: {
      "@type": "Question",
      name: card.question,
      text: card.question,
      // 페이지와 Question entity를 cross-reference로 강하게 연결 — Google이 1:1 매핑으로 인식.
      mainEntityOfPage: { "@id": `${url}#webpage` },
      answerCount: 1,
      upvoteCount: card.like_count ?? 0,
      dateCreated: created,
      author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
      acceptedAnswer: {
        "@type": "Answer",
        text: answerText.slice(0, 4000),
        author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
        dateCreated: created,
        upvoteCount: card.like_count ?? 0,
        url,
        // 학술 인용(Schema.org Citation) — pubmed_refs (멀티) 우선, 없으면 pubmed_ref (단일 legacy) fallback.
        // AI/검색엔진이 "논문 인용 붙은 의학 답변"으로 인식. 여러 ref 가 있으면 array 로 출력 (Schema.org spec OK).
        ...((() => {
          const c = card as {
            pubmed_ref?: Record<string, unknown> | null;
            pubmed_refs?: Array<Record<string, unknown>> | null;
          };
          const refs: Array<Record<string, unknown>> =
            c.pubmed_refs && c.pubmed_refs.length > 0
              ? c.pubmed_refs
              : c.pubmed_ref
                ? [c.pubmed_ref]
                : [];
          const built = refs
            .filter((ref) => ref && (ref.pmid || ref.doi))
            .map((ref) => {
              const citation: Record<string, unknown> = { "@type": "ScholarlyArticle" };
              if (ref.title) citation.name = ref.title;
              // canonical url은 DOI 우선(영구 식별자). 머신 마크업 DOI 우선.
              const citeUrl = (ref.doi_url as string) || (ref.pubmed_url as string) || null;
              if (citeUrl) citation.url = citeUrl;
              if (ref.doi_url && ref.pubmed_url) citation.sameAs = ref.pubmed_url;
              if (ref.year) citation.datePublished = ref.year;
              if (ref.journal) citation.publisher = ref.journal;
              if (ref.authors_short) citation.author = ref.authors_short;
              if (ref.pmid) citation.identifier = `PMID:${ref.pmid}`;
              return citation;
            });
          if (built.length === 0) return {};
          // 단일 ref 면 객체로, 멀티면 array — 둘 다 Schema.org citation spec 허용
          return { citation: built.length === 1 ? built[0] : built };
        })()),
      },
    },
    // 시술/조건/일반 자동 분류 (procedure-mappings 사전 활용)
    about: keywordsToAbout(card.keywords),
    specialty: "https://schema.org/Dermatologic",
    audience: { "@type": "MedicalAudience", audienceType: "Patient" },
  };

  // VideoObject — card.video(videos 테이블 join) 우선, 없으면 external_url(YouTube)에서 video_id 추출.
  // v5.1 spec D-1: 본문 발췌문은 VideoObject.description에 들어가 AEO 신호화.
  // Phase 6 카드는 videos 테이블 매핑 없이 external_url에 ?t={N}s 형태로 들어가 있어, 거기서 startOffset 추출.
  const video = card.video as
    | { youtube_id?: string | null; youtube_url?: string | null; topic?: string | null; upload_date?: string | null }
    | { youtube_id?: string | null; youtube_url?: string | null; topic?: string | null; upload_date?: string | null }[]
    | null
    | undefined;
  const v = Array.isArray(video) ? video[0] : video;

  // external_url에서 YouTube video_id + 타임스탬프 파싱 (예: https://youtu.be/MeycbSmQfxs?t=276s)
  const extUrl = (card as { external_url?: string | null }).external_url ?? null;
  let extVideoId: string | null = null;
  let extStartSeconds: number | null = null;
  if (extUrl) {
    const ytMatch = extUrl.match(/(?:youtu\.be\/|v=|youtube\.com\/embed\/)([\w-]{6,15})/);
    if (ytMatch) extVideoId = ytMatch[1];
    const tMatch = extUrl.match(/[?&]t=(\d+)s?/);
    if (tMatch) extStartSeconds = Number.parseInt(tMatch[1], 10);
  }

  const videoId = v?.youtube_id ?? extVideoId ?? null;
  if (videoId) {
    const videoName = v?.topic
      ? `${v.topic} — 영상에서 자세히 보기`
      : card.question;
    medicalPage.video = {
      "@type": "VideoObject",
      name: videoName,
      description: answerText.slice(0, 200),
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      contentUrl: v?.youtube_url ?? `https://youtu.be/${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      ...(v?.upload_date ? { uploadDate: v.upload_date } : {}),
      // ISO 8601 duration — 답변 구간이 영상의 어느 시점부터 시작되는지 명시 (AI 픽업률↑).
      ...(extStartSeconds !== null ? { startOffset: `PT${extStartSeconds}S` } : {}),
      inLanguage: "ko-KR",
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [medicalPage, physician, breadcrumb],
  };
}

export default async function DermatologistPostPage({ params }: Props) {
  const { slug, year, postSlug } = await params;
  const yearInt = Number.parseInt(year, 10);
  if (!Number.isFinite(yearInt) || yearInt < 2000 || yearInt > 2100) {
    notFound();
  }
  const card = await fetchQaByDoctorYearSlug(slug, yearInt, postSlug);
  if (!card) {
    return (
      <section className="mx-auto w-full max-w-[480px] py-10">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
          <div className="mb-4 text-5xl">📭</div>
          <h1 className="mb-2 text-lg font-bold text-[var(--text)]">
            글을 찾을 수 없어요
          </h1>
          <p className="mb-6 text-sm leading-[1.6] text-[var(--text-secondary)]">
            글이 삭제되었거나 비공개로 전환되었을 수 있어요.
            <br />
            피드에서 다른 좋은 글을 둘러보세요.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
            >
              피드로 가기
            </Link>
            <Link
              href={`/doctors/${slug}`}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              전문의 페이지
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const hotIds = Array.from(await getHotQaIds(20));
  const jsonLd = buildJsonLd(card, slug, yearInt, postSlug);

  return (
    <section className="mx-auto w-full max-w-[680px] py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      {/* 좌상단 ← 뒤로 — 다른 페이지와 동일하게 mb-1 -ml-1 통일. */}
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref={`/doctors/${slug}`} />
      </div>
      <Card
        card={card}
        isHot={hotIds.includes(card.id)}
        autoExpandComments
        forceExpanded
        asH1
      />
    </section>
  );
}

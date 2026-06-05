import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkHiddenByDoctorPost } from "@/lib/hidden-card";
import Card, { type CardData } from "@/components/Card";
import BackButton from "@/components/BackButton";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { buildDoctorReference } from "@/lib/schema/doctor";
import {
  clinicSchemaForDoctor,
  clinicIdRefForDoctor,
} from "@/lib/schema/clinic";
import { keywordsToAbout } from "@/lib/schema/procedure";
import { stripMarkdown } from "@/lib/strip-markdown";
import { jsonLdString } from "@/lib/json-ld";
import { CARD_DETAIL_SELECT } from "@/lib/card-select";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; year: string; postSlug: string }>;
};

const SITE = SITE_URL;

type QaWithModified = CardData & { updated_at?: string | null };

// React `cache()` 메모이즈 (2026-05-28).
//   같은 request 안에서 generateMetadata 와 page component 가 동일 인자로 호출하면
//   두 번째 호출은 첫 호출의 결과를 재사용 (DB 왕복 2회 → 1회). 다른 request 는
//   항상 fresh — force-dynamic 정책 유지.
const fetchQaByDoctorYearSlug = cache(async (
  doctorSlug: string,
  year: number,
  postSlug: string,
): Promise<QaWithModified | null> => {
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
});

// P2-5 (2026-05-29): hidden placeholder 로직 DRY → @/lib/hidden-card 로 추출.
const checkHiddenPlaceholder = checkHiddenByDoctorPost;

/**
 * 답변 본문 → meta description. 단어 중간 잘림 방지 — 문장부호(.!?…) 경계로 트림(~150자).
 *   ≤150 안에 문장 끝이 있으면 거기서 컷(첫 문장이 <20자면 그리디 매칭이 다음 문장까지 포함).
 *   문장 끝이 없으면 단어 경계로 컷. 잘렸으면 말줄임표(…) 부가.
 */
function metaDescriptionFromBody(body: string, max = 150): string {
  const text = stripMarkdown(body).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentence = slice.match(/^[\s\S]*[.!?。…](?=\s|$)/);
  let cut: string;
  if (sentence && sentence[0].trim().length >= 20) {
    cut = sentence[0].trim();
  } else {
    const lastSpace = slice.lastIndexOf(" ");
    cut = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
  }
  return cut.length < text.length ? `${cut}…` : cut;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year, postSlug } = await params;
  const yearInt = Number.parseInt(year, 10);
  if (!Number.isFinite(yearInt)) {
    return { title: "피부텐텐", robots: { index: false } };
  }
  const card = await fetchQaByDoctorYearSlug(slug, yearInt, postSlug);
  if (!card) {
    // Hidden placeholder 면 noindex (본문 미노출).
    const hidden = await checkHiddenPlaceholder(slug, yearInt, postSlug);
    if (hidden) {
      return {
        title: "비공개 처리된 게시물",
        robots: { index: false, follow: false },
      };
    }
    return { title: "피부텐텐", robots: { index: false } };
  }
  const docName = card.doctor?.name ? `${card.doctor.name} 원장님` : "피부텐텐";
  // 2026-05-18: description 은 답변 본문만 — title 영역에 이미 질문이 표시되고 원장 이름은
  //   OG 이미지(profile photo + 직함 배지)에 노출되므로 prefix 중복 제거.
  const desc = metaDescriptionFromBody(card.body);
  const canonical = `${SITE}/doctors/${slug}/${year}/${encodeURIComponent(postSlug)}`;
  // 2026-05-28: openGraph/twitter boilerplate 는 lib/og-meta.ts 헬퍼로 통합.
  return {
    title: card.title,
    description: desc,
    alternates: { canonical },
    ...buildSocialMeta({
      title: card.title,
      description: desc,
      canonical,
      ogImage: buildOgImage(card.doctor?.slug),
      ogType: "article",
      ogImageAlt: docName,
    }),
  };
}

function buildJsonLd(
  card: QaWithModified,
  doctorSlug: string,
  year: number,
  postSlug: string,
) {
  const url = `${SITE}/doctors/${doctorSlug}/${year}/${encodeURIComponent(postSlug)}`;
  // 표시일 SSOT (P1-b): reviewed_at(의료 검토일) 우선, 없으면 created_at.
  //   datePublished/lastReviewed 모두 이 displayDate 기준.
  const displayDate =
    card.reviewed_at ?? card.created_at ?? new Date().toISOString();
  // dateModified 는 실제 마지막 수정일(updated_at) 의미 유지. 없으면 표시일로 fallback.
  const modified = card.updated_at ?? displayDate;
  const docName = card.doctor?.name ?? "";
  const answerText = stripMarkdown(card.body);

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
      { "@type": "ListItem", position: 4, name: card.title },
    ],
  };

  // Person + worksFor → 해당 의사가 속한 단일 지점 @id 참조.
  // 그 지점 schema 자체는 아래 @graph 에 함께 inject 하여 reference 보장.
  const physicianBase = buildDoctorReference({
    slug: doctorSlug,
    name: docName,
  });
  const worksForRef = clinicIdRefForDoctor(doctorSlug);
  const physician = worksForRef
    ? { ...physicianBase, worksFor: worksForRef }
    : physicianBase;
  const singleClinic = clinicSchemaForDoctor(doctorSlug);

  // QAPage — 단일 질문 + 의사 검수 답변 + SNS 인터랙션 신호
  const medicalPage: Record<string, unknown> = {
    "@type": ["MedicalWebPage", "QAPage"],
    "@id": `${url}#webpage`,
    url,
    name: card.title,
    inLanguage: "ko-KR",
    datePublished: displayDate, // 표시일 = reviewed_at ?? created_at (P1-b)
    dateModified: modified, // cards.updated_at 활용 (AI freshness) — 실제 마지막 수정일
    lastReviewed: displayDate.slice(0, 10), // 의료 검토일 = reviewed_at ?? created_at
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
      name: card.title,
      text: card.title,
      // 페이지와 Question entity를 cross-reference로 강하게 연결 — Google이 1:1 매핑으로 인식.
      mainEntityOfPage: { "@id": `${url}#webpage` },
      answerCount: 1,
      upvoteCount: card.like_count ?? 0,
      dateCreated: displayDate,
      author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
      acceptedAnswer: {
        "@type": "Answer",
        text: answerText.slice(0, 4000),
        author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
        dateCreated: displayDate,
        upvoteCount: card.like_count ?? 0,
        url,
        // 학술 인용(Schema.org Citation) — pubmed_refs 배열 (ADR 0012 단일 출처).
        ...((() => {
          const c = card as {
            pubmed_refs?: Array<Record<string, unknown>> | null;
          };
          const refs: Array<Record<string, unknown>> = c.pubmed_refs ?? [];
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
      : card.title;
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
    "@graph": [
      medicalPage,
      physician,
      breadcrumb,
      // 해당 의사의 단일 지점 MedicalClinic — physician.worksFor 가 가리키는 entity 보장.
      // 5개 지점 전체 inject 안 함 (페이지 핵심 entity 신호 분산 회피).
      ...(singleClinic ? [singleClinic] : []),
    ],
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
    // Hidden qa 카드면 placeholder 한 줄 + 문의 안내. 진짜 없는 글이면 기존 "글 없음" 화면.
    const hidden = await checkHiddenPlaceholder(slug, yearInt, postSlug);
    if (hidden) {
      return (
        <section className="mx-auto w-full max-w-[480px] py-10">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-sm)]">
            <p className="text-[14px] font-semibold text-[var(--text)]">
              운영정책에 따라 비공개된 게시물입니다.
            </p>
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">
              이의가 있으시면{" "}
              <a
                href="mailto:pibutenten@gmail.com"
                className="text-[var(--primary)] hover:underline"
              >
                pibutenten@gmail.com
              </a>
              으로 문의해 주세요.
            </p>
          </div>
        </section>
      );
    }
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

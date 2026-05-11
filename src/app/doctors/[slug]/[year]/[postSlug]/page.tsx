import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { buildDoctorReference } from "@/lib/schema/doctor";
import { keywordsToAbout } from "@/lib/schema/procedure";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; year: string; postSlug: string }>;
};

const SITE = SITE_URL;

type QaWithModified = QACardData & { updated_at?: string | null };

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
      .from("qas")
      .select(
        `
        id, question, answer, meta, keywords, type, created_at, updated_at, posted_as,
        like_count, view_count, post_year, post_slug,
        category, hide_doctor_credential, pubmed_ref,
        external_url, external_title, external_description, external_image, external_site_name,
        doctor:doctors(slug, name, branch),
        author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url),
        video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
      )
      .eq("doctor_id", doctor.id)
      .eq("post_year", year)
      .eq("post_slug", postSlug)
      .eq("status", "published")
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
  const qa = await fetchQaByDoctorYearSlug(slug, yearInt, postSlug);
  if (!qa) return { title: "피부텐텐", robots: { index: false } };
  const docName = qa.doctor?.name ? `${qa.doctor.name} 원장님` : "피부텐텐";
  const desc = (qa.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
  const ogUrl = qa.doctor?.slug ? `/og/${qa.doctor.slug}.png` : `/og.png`;
  const canonical = `${SITE}/doctors/${slug}/${year}/${encodeURIComponent(postSlug)}`;
  return {
    title: qa.question,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title: qa.question,
      description: `${docName} — ${desc}`,
      type: "article",
      url: canonical,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: docName }],
    },
    twitter: {
      card: "summary_large_image",
      title: qa.question,
      description: `${docName} — ${desc}`,
      images: [ogUrl],
    },
  };
}

function buildJsonLd(
  qa: QaWithModified,
  doctorSlug: string,
  year: number,
  postSlug: string,
) {
  const url = `${SITE}/doctors/${doctorSlug}/${year}/${encodeURIComponent(postSlug)}`;
  const created = qa.created_at ?? new Date().toISOString();
  const modified = qa.updated_at ?? created;
  const docName = qa.doctor?.name ?? "";
  const answerText = (qa.answer ?? "").replace(/\s+/g, " ").trim();

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
      { "@type": "ListItem", position: 4, name: qa.question },
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
    name: qa.question,
    inLanguage: "ko-KR",
    datePublished: created,
    dateModified: modified, // qas.updated_at 활용 (AI freshness)
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
      cssSelector: [".qa-answer-speakable"],
    },
    mainEntity: {
      "@type": "Question",
      name: qa.question,
      text: qa.question,
      // 페이지와 Question entity를 cross-reference로 강하게 연결 — Google이 1:1 매핑으로 인식.
      mainEntityOfPage: { "@id": `${url}#webpage` },
      answerCount: 1,
      upvoteCount: qa.like_count ?? 0,
      dateCreated: created,
      author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
      acceptedAnswer: {
        "@type": "Answer",
        text: answerText.slice(0, 4000),
        author: { "@id": `${SITE}/doctors/${doctorSlug}#person` },
        dateCreated: created,
        upvoteCount: qa.like_count ?? 0,
        url,
        // 학술 인용(Schema.org Citation) — pubmed_ref 있을 때만. AI/검색엔진이 "논문 인용 붙은 의학 답변"으로 인식.
        ...((() => {
          const ref = (qa as { pubmed_ref?: Record<string, unknown> | null }).pubmed_ref;
          if (!ref || (!ref.pmid && !ref.doi)) return {};
          const citation: Record<string, unknown> = { "@type": "ScholarlyArticle" };
          if (ref.title) citation.name = ref.title;
          // canonical url은 DOI 우선(영구 식별자). 사용자 화면 링크는 PubMed지만 머신 마크업은 DOI를 우선해 둠.
          const citeUrl = (ref.doi_url as string) || (ref.pubmed_url as string) || null;
          if (citeUrl) citation.url = citeUrl;
          // PubMed URL도 sameAs로 함께 노출 — AI/검색엔진이 두 식별자 모두 인식.
          if (ref.doi_url && ref.pubmed_url) citation.sameAs = ref.pubmed_url;
          if (ref.year) citation.datePublished = ref.year;
          if (ref.journal) citation.publisher = ref.journal;
          if (ref.authors_short) citation.author = ref.authors_short;
          if (ref.pmid) citation.identifier = `PMID:${ref.pmid}`;
          return { citation };
        })()),
      },
    },
    // 시술/조건/일반 자동 분류 (procedure-mappings 사전 활용)
    about: keywordsToAbout(qa.keywords),
    specialty: "https://schema.org/Dermatologic",
    audience: { "@type": "MedicalAudience", audienceType: "Patient" },
  };

  // VideoObject — qa.video(videos 테이블 join) 우선, 없으면 external_url(YouTube)에서 video_id 추출.
  // v5.1 spec D-1: 본문 발췌문은 VideoObject.description에 들어가 AEO 신호화.
  // Phase 6 카드는 videos 테이블 매핑 없이 external_url에 ?t={N}s 형태로 들어가 있어, 거기서 startOffset 추출.
  const video = qa.video as
    | { youtube_id?: string | null; youtube_url?: string | null; topic?: string | null; upload_date?: string | null }
    | { youtube_id?: string | null; youtube_url?: string | null; topic?: string | null; upload_date?: string | null }[]
    | null
    | undefined;
  const v = Array.isArray(video) ? video[0] : video;

  // external_url에서 YouTube video_id + 타임스탬프 파싱 (예: https://youtu.be/MeycbSmQfxs?t=276s)
  const extUrl = (qa as { external_url?: string | null }).external_url ?? null;
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
      : qa.question;
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
  const qa = await fetchQaByDoctorYearSlug(slug, yearInt, postSlug);
  if (!qa) {
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
  const jsonLd = buildJsonLd(qa, slug, yearInt, postSlug);

  return (
    <section className="mx-auto w-full max-w-[680px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <QACard
        qa={qa}
        isHot={hotIds.includes(qa.id)}
        autoExpandComments
        forceExpanded
        asH1
      />
    </section>
  );
}

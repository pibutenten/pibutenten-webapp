import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { buildDoctorReference } from "@/lib/schema/doctor";
import { keywordsToAbout } from "@/lib/schema/procedure";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

/** 추가 컬럼 — /doctors/{slug}/{year}/{postSlug} canonical URL 판정용 */
type QaWithSlugFields = QACardData & {
  post_year?: number | null;
  post_slug?: string | null;
  updated_at?: string | null;
};

async function fetchQa(id: string): Promise<QaWithSlugFields | null> {
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("qas")
      .select(
        `
        id, question, answer, meta, keywords, type, created_at, updated_at, posted_as,
        like_count, view_count, post_year, post_slug,
        doctor:doctors(slug, name, branch),
        author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url),
        video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
      )
      .eq("id", numId)
      .eq("status", "published")
      .maybeSingle()
      .returns<QaWithSlugFields>();
    return data;
  } catch {
    // 네트워크 / RLS / 알 수 없는 오류 → null 반환 (graceful degrade)
    return null;
  }
}

/** 의사 글이고 post_slug + post_year 모두 있으면 canonical 새 URL 반환 */
function canonicalNewUrl(qa: QaWithSlugFields): string | null {
  if (qa.doctor?.slug && qa.post_year && qa.post_slug) {
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${encodeURIComponent(qa.post_slug)}`;
  }
  return null;
}

const SITE = SITE_URL;

/** 단일 Q&A 메타 — 공유 시 카드 미리보기 + canonical */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const qa = await fetchQa(id);
  if (!qa) return { title: "피부텐텐", robots: { index: false } };
  const docName = qa.doctor?.name ? `${qa.doctor.name} 원장님` : "피부텐텐";
  // 답변 앞부분 100자로 description
  const desc = (qa.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
  // 원장별 미리 제작된 OG PNG 직접 사용 (satori 합성 안 거침)
  const ogUrl = qa.doctor?.slug
    ? `/og/${qa.doctor.slug}.png`
    : `/og.png`;
  const canonical = `${SITE}/qa/${qa.id}`;
  // 회원 글(doctor 없음, posted_as personal)은 noindex — UGC 의료 안전성
  const isUgc = !qa.doctor || qa.posted_as === "personal";
  return {
    title: qa.question,
    description: desc,
    alternates: { canonical },
    robots: isUgc
      ? { index: false, follow: true }
      : { index: true, follow: true },
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

/**
 * Q&A 상세 JSON-LD 빌더
 *  - 의사 작성: MedicalWebPage + FAQPage + Question + Answer + Physician + BreadcrumbList
 *  - 회원 작성(UGC): Question만 (의료 정보로 인식 X) — 별도로 noindex 적용
 */
function buildJsonLd(qa: QaWithSlugFields) {
  const url = `${SITE}/qa/${qa.id}`;
  const created = qa.created_at ?? new Date().toISOString();
  const modified = qa.updated_at ?? created;
  const isDoctorPost = !!qa.doctor && qa.posted_as !== "personal";
  const docSlug = qa.doctor?.slug;
  const docName = qa.doctor?.name ?? "";
  const answerText = (qa.answer ?? "").replace(/\s+/g, " ").trim();

  if (!isDoctorPost) {
    // 회원 글 — Question만 (Answer 스키마 절대 X)
    return {
      "@context": "https://schema.org",
      "@type": "Question",
      name: qa.question,
      author: {
        "@type": "Person",
        name: qa.author?.alt_display_name ?? qa.author?.display_name ?? "회원",
      },
      dateCreated: created,
      answerCount: 0,
    };
  }

  const breadcrumb = {
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
        name: `${docName} 원장`,
        item: `${SITE}/doctors/${docSlug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: qa.question,
      },
    ],
  };

  // 의사 객체는 reference만 (풀 정보는 /doctors/[slug] 페이지의 @id가 보유)
  const physician = buildDoctorReference({
    slug: docSlug as string,
    name: docName,
  });

  // QAPage — 단일 질문 + 의사 검수 답변 + SNS 인터랙션 신호.
  // FAQPage(여러 Q&A 모음)보다 우리 콘텐츠 구조에 정확하며 AI 인용 친화.
  const medicalPage = {
    "@type": ["MedicalWebPage", "QAPage"],
    "@id": `${url}#webpage`,
    url,
    name: qa.question,
    inLanguage: "ko-KR",
    datePublished: created,
    dateModified: modified, // qas.updated_at — 글 수정 시 자동 갱신 (AI freshness)
    lastReviewed: modified.slice(0, 10),
    reviewedBy: { "@id": `${SITE}/doctors/${docSlug}#person` },
    isPartOf: { "@id": `${SITE}/#website` },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${SITE}/og/${docSlug}.png`,
    },
    mainEntity: {
      "@type": "Question",
      name: qa.question,
      text: qa.question,
      answerCount: 1,
      upvoteCount: qa.like_count ?? 0,
      dateCreated: created,
      author: { "@id": `${SITE}/doctors/${docSlug}#person` },
      acceptedAnswer: {
        "@type": "Answer",
        text: answerText.slice(0, 4000), // schema 안전 길이
        author: { "@id": `${SITE}/doctors/${docSlug}#person` },
        dateCreated: created,
        upvoteCount: qa.like_count ?? 0,
        url,
      },
    },
    // 태그별 MedicalProcedure / MedicalCondition / Thing 자동 분류
    // (procedure-mappings 사전 활용 — 시술은 procedureType + bodyLocation 자동 부착)
    about: keywordsToAbout(qa.keywords),
    specialty: "https://schema.org/Dermatologic",
    audience: { "@type": "MedicalAudience", audienceType: "Patient" },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [medicalPage, physician, breadcrumb],
  };
}

export default async function SingleQaPage({ params }: Props) {
  const { id } = await params;
  const qa = await fetchQa(id);
  // 의사 글에 새 URL이 있으면 canonical로 redirect (308 영구)
  // — 외부 공유 URL은 보존되면서 검색엔진은 새 URL을 인덱싱하게 됨
  if (qa) {
    const newUrl = canonicalNewUrl(qa);
    if (newUrl) redirect(newUrl);
  }
  // 글이 없거나 접근 불가 → 404 대신 친근한 안내 페이지 노출
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
              href="/doctors"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              전문의 둘러보기
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const hotIds = Array.from(await getHotQaIds(20));
  const jsonLd = buildJsonLd(qa);

  return (
    <section className="mx-auto w-full max-w-[680px]">
      {/* JSON-LD: 의사 글 → MedicalWebPage+FAQPage+Physician+Breadcrumb / 회원 글 → Question */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* 단독 페이지: 카드 펼친 상태로 보여주려 본문 자동 expand는 카드 내부 isLong 토글로 처리.
          댓글창은 자동 열림 + 입력 포커스(autoExpandComments). */}
      <QACard
        qa={qa}
        isHot={hotIds.includes(qa.id)}
        autoExpandComments
        forceExpanded
      />
      {/* 의료 면책은 /about 페이지 통합 — 카드마다 노출 X (Footer 링크로 접근 가능) */}
    </section>
  );
}

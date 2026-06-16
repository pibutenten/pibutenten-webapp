import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { checkHiddenByDoctorPost } from "@/lib/hidden-card";
import { type CardData } from "@/components/Card";
import BetaSkinShell from "@/components/skin/BetaSkinShell";
import { renderBetaPost } from "@/components/skin/post/post-data";
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

// V3 (2026-06-07): ISR 24h 실활성화. 공개 콘텐츠(질문·답변·의사·스키마)는 모두에게 동일 →
//   캐시. 개인 상태(좋아요/저장)는 Card("use client")가 클라에서 가져옴 → 캐시 HTML 에 개인정보 0.
//   발행/수정 시 발행 라우트의 revalidateTag('qa-content') + revalidatePath('/','layout') 로 즉시 갱신.
export const revalidate = 86400;

// 동적 라우트를 ISR(on-demand 생성+캐시) 모드로 진입시키는 스위치. 빌드 프리렌더 0(런타임 생성).
export function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ slug: string; year: string; postSlug: string }>;
};

const SITE = SITE_URL;

type QaWithModified = CardData & { updated_at?: string | null };

// V3 (2026-06-07): 공유 공개 데이터(published qa)만 unstable_cache 로 캐시.
//   ★개인별 읽기 없음(anon 쿠키리스 클라 → published 행만) → 캐시 결과에 개인정보 0.
//   RPC/POST 아니어도 fetch 캐시 대신 함수결과 캐시라 ISR 안정. 발행 시 revalidateTag('qa-content').
const fetchQaCached = unstable_cache(
  async (
    doctorSlug: string,
    year: number,
    postSlug: string,
  ): Promise<QaWithModified | null> => {
    try {
      // 쿠키리스 anon 클라이언트 — 공개 published 행만 읽음(개인 컨텍스트 없음).
      const supabase = createSupabaseAnonClient();
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
  },
  ["qa-detail"],
  { revalidate: 86400, tags: ["qa-content"] },
);

// React `cache()` 메모이즈 — 같은 request 안에서 generateMetadata 와 page component 가
//   동일 인자로 호출 시 두 번째는 첫 결과 재사용(요청 내 dedup). 영속 캐시는 위 unstable_cache.
const fetchQaByDoctorYearSlug = cache(fetchQaCached);

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
        // position 3 연도 — 연도별 목록 라우트(/doctors/{slug}/{year})가 존재하지 않아
        //   깨진 URL 을 가리키던 item 필드 제거. name 만 유지(Google 가이드상 허용).
        "@type": "ListItem",
        position: 3,
        name: `${year}년`,
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
      "@id": `${SITE}/#organization`,
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
        <BetaSkinShell active="피드" back={`/doctors/${slug}`}>
          <section className="mx-auto w-full max-w-[480px] py-10">
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
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
        </BetaSkinShell>
      );
    }
    // 진짜 없는 글(삭제/미존재/비공개 전환) — hidden placeholder 가 아니므로 정식 404.
    //   전역 not-found.tsx 로 렌더되며 HTTP 404 반환 → soft-404 제거.
    notFound();
  }

  const jsonLd = buildJsonLd(card, slug, yearInt, postSlug);

  // 본문은 베타 글상세(renderBetaPost → PostDetail → PostCard forceExpanded)로 승격.
  //   SEO 자산은 100% 보존: generateMetadata / canonical / robots / notFound / hidden 은 위에서 그대로.
  //   JSON-LD <script> 는 베타 셸(fixed 오버레이) 바깥(server Fragment)에 유지 → 셸이 덮어도 head 외 DOM 에 남아 크롤러가 읽음.
  //   anon(쿠키리스) supabase 를 그대로 넘김 → renderBetaPost 내부도 published 행만 읽어 캐시 HTML 에 개인정보 0(viewer 는 클라가 마운트 후 별도 취득).
  //   video_id 는 CARD_DETAIL_SELECT 에 없으므로 null — "같은 영상 추천"만 생략되고 키워드 기반 연관 Q&A 는 정상.
  const supabase = createSupabaseAnonClient();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      {await renderBetaPost(supabase, card, null)}
    </>
  );
}

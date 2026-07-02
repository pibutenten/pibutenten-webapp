import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type CardData } from "@/components/Card";
import { getReportSummaryForTag } from "@/lib/procedure-report";
import type { ProcedureReport, ReportTagSummary } from "@/lib/procedure-report";
import {
  buildHeadlinePool,
  pickHeadline,
  toSignals,
} from "@/lib/report-headline";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import {
  clinicIdRefForDoctor,
  clinicSchemaForDoctor,
} from "@/lib/schema/clinic";
import { getFeedSidebarDataCached } from "@/lib/feed-sidebar-cached";
import TopicTagView from "./TopicTagView";

/* 사이드바 데이터(인기태그·인기 Q&A)는 홈과 공용 getFeedSidebarDataCached
 *   (@/lib/feed-sidebar-cached, 쿠키리스 anon + unstable_cache 5분) — 매 요청 300건
 *   feed_cards_scored 사이드바 전용 호출을 제거(PERF). */

/**
 * /topics/{태그} — 태그별 의사 글 hub.
 *
 * v5.2 spec:
 *  - URL은 한국어 그대로 (UTF-8)
 *  - 의사 글 4개 이상 모인 태그만 페이지 활성화 (그 미만은 404)
 *  - 정렬: SNS-style 시간가중 + jitter (메인 피드와 동일)
 *    · tag_cards_scored RPC (HALF_LIFE=14일, JITTER_AMP=0.2)
 *    · 봇·사용자 동일 RPC — Google이 다른 순서를 봐도 무방
 *    · canonical은 그대로 → SEO 영향 X
 *  - doctor 매핑된 글 + category = 'qa' 만 인덱싱 (tip 폐지, 2026-06-01)
 *  - JSON-LD CollectionPage + ItemList (itemListOrder=Unordered)
 *  - ISR 비활성: dynamic — 매 요청마다 새 셔플 (jitter 살리기)
 */

export const dynamic = "force-dynamic";
export const dynamicParams = true;

const PAGE_LIMIT = 50; // 페이지당 카드 수 (단순 — 페이지네이션은 추후)
const MIN_DOCTOR_POSTS = 4;

type Props = {
  params: Promise<{ tag: string }>;
};

type IndexableTag = { keyword: string; cnt: number };

async function fetchAllIndexableTags(): Promise<IndexableTag[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_indexable_tags", {
    p_min_count: MIN_DOCTOR_POSTS,
  });
  return (data ?? []) as IndexableTag[];
}

/** 태그의 의사 qa 글 수 — generateMetadata 와 본문(fetchPostsForTag)이 같은 요청에서
 *   동일 count 쿼리를 중복 실행하던 것을 React cache() 로 1회 통합.
 *   supabase 클라는 내부 생성(인자로 넘기면 호출부마다 참조가 달라 캐시 미스). */
const qaCountForTag = cache(async (tag: string): Promise<number> => {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("category", "qa")
    .not("doctor_id", "is", null)
    .contains("keywords", [tag]);
  return count ?? 0;
});

async function fetchPostsForTag(
  tag: string,
): Promise<{ posts: CardData[]; count: number }> {
  const supabase = await createSupabaseServerClient();
  // 시간가중 + jitter 셔플 — tag_cards_scored RPC
  // (메인 피드 feed_cards_scored 와 동일 공식: HALF_LIFE=14일, jitter=0.2 → ±10%)
  const rpcRes = await supabase.rpc("tag_cards_scored", {
    p_tag: tag,
    p_limit: PAGE_LIMIT,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0.2,
  });
  const posts = (rpcRes.data ?? []) as CardData[];

  // count 는 RPC가 limit 까지만 주므로 별도 조회 — qaCountForTag(요청 단위 cache, 메타와 공유)
  const count = await qaCountForTag(tag);

  return { posts, count };
}

/** ReportTagSummary → 헤드라인 엔진(toSignals)이 받는 최소 ProcedureReport.
 *   분포 배열은 비움 — toSignals 가 빈 분포면 avgSatisfaction/avgPain 으로 폴백하는
 *   컴팩트 풀(getReviewSummaryFeedPool) 경로와 동일. 효과·다운타임·시점은 pool 요약에
 *   없으므로 0/빈값 → 해당 헤드라인 분기 자동 생략(자체 헤드라인 로직 신규 작성 없음). */
function summaryToReport(tag: string, s: ReportTagSummary): ProcedureReport {
  return {
    procedureKo: tag,
    en: "",
    anchor: null,
    category: s.category,
    count: s.count,
    avgSatisfaction: s.satAvg ?? 0,
    satisfactionDist: [0, 0, 0, 0, 0],
    avgPain: s.painAvg ?? 0,
    painDist: [0, 0, 0, 0, 0],
    revisit: s.revisit,
    effects: [],
    noEffectCount: 0,
    downtimeAnswered: 0,
    downtimeDist: [0, 0, 0, 0, 0],
    onsetAnswered: 0,
    onsetDist: [0, 0, 0, 0, 0],
    demographics: { male: 0, female: 0, total: 0, ageBands: [] },
  };
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const url = `${SITE_URL}/topics/${encodeURIComponent(tag)}`;
  // N = 이 시술의 의사 qa 글 수(동적) — 본문과 공유하는 요청 단위 cache(qaCountForTag).
  const n = await qaCountForTag(tag);
  const title = `${tag} Q&A 총정리`;
  const description = `원리·효과·지속기간·부작용·통증까지, 피부과 전문의가 직접 답한 질문 ${n}개를 한곳에.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    ...buildSocialMeta({
      title,
      description,
      canonical: url,
      ogImage: buildOgImage(null),
      ogType: "website",
    }),
  };
}

export default async function TagPage({ params }: Props) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim();
  if (!tag) notFound();

  // 1) 의사 글 4개 이상인지 검증 — 미만이면 404
  const allTags = await fetchAllIndexableTags();
  const found = allTags.find((t) => t.keyword === tag);
  if (!found) notFound();

  // 2) 해당 태그의 의사 글 fetch (최신순)
  const { posts, count } = await fetchPostsForTag(tag);
  if (posts.length === 0) notFound();

  // 2-b) /topics(전문의 Q&A 허브)와 /reports(후기 집계)는 의도 다른 독립 페이지(자기잠식 방지).
  //   리포트 카드·개별 후기는 /topics 에 렌더하지 않고, 이 시술의 /reports 가 존재하면
  //   닫힌 리포트 글상자(ReportSummaryBox) 1개만 노출. 존재·요약은 경량
  //   get_review_summary_pool(ko===tag) 로 판단(무거운 getProcedureReport 미사용).
  const supabase = await createSupabaseServerClient();
  const [summary, sidebarData] = await Promise.all([
    getReportSummaryForTag(supabase, tag),
    getFeedSidebarDataCached(),
  ]);

  // 글상자 헤드라인 — /reports 인덱스와 동일 엔진(report-headline)을 서버에서 확정해
  //   prop 으로 전달(SSR/CSR 일치 — 클라 재계산 금지). 요약이 없으면 글상자 미노출.
  //   방어: pool 평균이 null(이론상 — 만족도·통증은 폼 필수라 실제 발생 없음)이면 0 대입
  //   헤드라인("만족도 0.0…")이 오문구가 되므로 헤드라인만 생략(빈 문자열 → 글상자가 줄 미표시).
  const reportSummary = summary
    ? {
        ...summary,
        headline:
          summary.satAvg == null || summary.painAvg == null
            ? ""
            : pickHeadline(buildHeadlinePool(toSignals(summaryToReport(tag, summary)))),
      }
    : null;

  // 3) JSON-LD: @graph 로 CollectionPage + FAQPage 묶음 출력.
  //    AEO/GEO/SEO 강화:
  //      - FAQPage.mainEntity = Question[] 각 카드 1개씩
  //      - 각 acceptedAnswer.author = Physician (의사 EEAT 신호 — 검증된 의사 답변)
  //      - publisher / isPartOf = Organization 피부텐텐 (브랜드 권위, layout 의 #organization 참조)
  //    화면 비노출 — Google·Bing·Perplexity·ChatGPT 등이 해석하여 인용 우선순위 결정.
  const url = `${SITE_URL}/topics/${encodeURIComponent(tag)}`;
  const ORG_ID = `${SITE_URL}/#organization`;

  // 답변 본문 snippet — 1단락(또는 400자) 한정. FAQPage spec 권장.
  const answerSnippet = (p: CardData): string => {
    const txt = (p.body ?? "").replace(/\s+/g, " ").trim();
    return txt.length > 400 ? txt.slice(0, 400) + "…" : txt;
  };

  // 의사 개인 @id (`/doctors/{slug}#person`) — 단일 문서 내 동일 의사 중복 시 @id 로 dedup.
  //   @type 은 ["Person","MedicalProfessional"] (schema/doctor.ts 와 정합).
  //   ⚠ Physician 은 LocalBusiness/MedicalOrganization 트리라 의사 개인에 부적합(Google 이
  //     "비즈니스"로 오인) → 프로젝트 전역에서 금지. MedicalProfessional 은 Person 상속이라 정확.
  // worksFor 는 의사 글·프로필 페이지와 동일하게 `clinicIdRefForDoctor` 의 @id 참조 패턴.
  //   참조 entity 의 MedicalClinic schema 는 graph 의 dedup 된 clinicSchemas 에서 함께 inject.
  const doctorPersonRef = (p: CardData) => {
    if (!p.doctor) return null;
    const worksForRef = clinicIdRefForDoctor(p.doctor.slug);
    return {
      "@type": ["Person", "MedicalProfessional"],
      "@id": `${SITE_URL}/doctors/${p.doctor.slug}#person`,
      name: p.doctor.name,
      jobTitle: "피부과 전문의",
      medicalSpecialty: "https://schema.org/Dermatologic",
      url: `${SITE_URL}/doctors/${p.doctor.slug}`,
      ...(worksForRef ? { worksFor: worksForRef } : {}),
      memberOf: { "@id": ORG_ID },
    };
  };

  // 등장 의사들의 단일 지점 MedicalClinic schema — @id 기준 중복 제거.
  // 한 토픽에 같은 지점 의사 N명이 있어도 그 지점 schema 는 1개만 inject.
  const seenClinicIds = new Set<string>();
  const clinicSchemas: Record<string, unknown>[] = [];
  for (const p of posts) {
    if (!p.doctor?.slug) continue;
    const cs = clinicSchemaForDoctor(p.doctor.slug);
    if (!cs) continue;
    const cid = cs["@id"];
    if (typeof cid !== "string" || seenClinicIds.has(cid)) continue;
    seenClinicIds.add(cid);
    clinicSchemas.push(cs);
  }

  const collectionPage = {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name: `${tag} — 피부과 전문의 답변 모음`,
    url,
    about: { "@type": "Thing", name: tag },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": ORG_ID },
    inLanguage: "ko-KR",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListOrder: "https://schema.org/ItemListUnordered",
      itemListElement: posts.slice(0, 20).map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: postUrl(p),
        name: p.title,
      })),
    },
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": ORG_ID },
    // 각 카드 = Question + acceptedAnswer (의사 작성). FAQPage spec 충족.
    mainEntity: posts.map((p) => ({
      "@type": "Question",
      name: p.title,
      url: postUrl(p),
      acceptedAnswer: {
        "@type": "Answer",
        text: answerSnippet(p),
        url: postUrl(p),
        ...(p.doctor ? { author: doctorPersonRef(p) } : {}),
      },
    })),
  };

  // BreadcrumbList — 홈 → 전문의 Q&A(허브 인덱스 라우트 없음 → name-only) → 현재 태그.
  //   /topics 인덱스 페이지는 존재하지 않으므로(라우트는 /topics/[tag] 만) 중간 크럼브에 item 을
  //   넣지 않는다(깨진 링크 방지). reports/[procedure] 의 "시술 리포트" name-only 와 동일 패턴.
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "전문의 Q&A" },
      { "@type": "ListItem", position: 3, name: tag, item: url },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [collectionPage, faqPage, breadcrumb, ...clinicSchemas],
  };

  // JSON-LD <script> 는 server 에 남겨 SEO 신호 100% 보존. 본문은 앱 셸(AppShell)로
  //   감싼 TopicTagView 가 표시(정보 구조·데이터 무변경). DoctorDashboardView 선례 동일 패턴.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <TopicTagView
        tag={tag}
        posts={posts}
        count={count}
        reportSummary={reportSummary}
        popularTags={sidebarData.popularTags}
        hotQa={sidebarData.hotQa}
      />
    </>
  );
}

/**
 * Card 글의 canonical URL 계산 — JSON-LD ItemList용.
 * 의사 글이라 항상 doctor + post_year + post_slug 가 있어야 함.
 * (없으면 fallback /{handle}/{shortcode})
 */
function postUrl(p: CardData): string {
  const d = p.doctor as { slug: string } | null | undefined;
  if (d?.slug && p.post_year && p.post_slug) {
    return `${SITE_URL}/doctors/${d.slug}/${p.post_year}/${p.post_slug}`;
  }
  if (p.shortcode) {
    const a = p.author as { handle?: string | null } | null | undefined;
    const handle = a?.handle ?? null;
    if (handle) return `${SITE_URL}/${handle}/${p.shortcode}`;
  }
  return SITE_URL;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getProcedureReport,
  getFamilyReviewCardIds,
  categoryKoToSlug,
  FEED_MIN_REVIEWS,
} from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import type { ProcedureSlug } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import ReportsDetailView from "./ReportsDetailView";

// tag_dictionary.category(한글) → 테마 slug 는 procedure-report.ts 의 categoryKoToSlug(SSOT)
//   를 그대로 사용 — '비슷한 시술' 후보 카드의 카테고리 색을 정하는 데만 쓰인다.

// 렌더링 전략: 옛 상세의 설정을 그대로 보존(force-dynamic). review-report-revalidate 가
//   후기 변동 시 revalidatePath('/reports/{ko}') 를 호출해 stale 을 정리하는 ISR 의도가
//   문서·코드에 있으나, 이 페이지는 reviewLiked 산출을 위해 supabase.auth.getUser()(쿠키)를
//   읽으므로 force-static/시간기반 ISR 과 양립하지 않는다. reports-new 의 force-dynamic 강요가
//   아니라 옛 정식 상세가 쓰던 동일 설정이므로 그대로 유지한다(렌더링 전략 무변경).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

// param 은 영문 슬러그(taxonomy.en) 또는 기존 한글(ko) 둘 다 허용 — 한글 URL 비파괴.
// en 은 소문자 매칭, ko 는 원문 매칭. 미존재만 null(→404). ko 는 후기 스트림·집계·JSON-LD,
// en 은 canonical·내부 링크에 사용.
// PostgREST `.or()` 는 문자열 파서라 `,` `.` `()` 등 메타문자로 필터 구조 조작 표면이 있다.
//   `.or()` 보간 직전 입력 화이트리스트 게이트 — middleware.ts(reports redirect) /
//   identity-shared.ts(bundleProfileFilter) 와 동일 방어 스타일. 시술명은 한글이므로
//   한글·영문소문자대문자·숫자·공백·하이픈·가운뎃점만 허용(한글 정식 URL 비파괴).
const PROCEDURE_SLUG_RE = /^[가-힣a-zA-Z0-9 ·-]+$/;

// React cache() — generateMetadata 와 본문이 같은 요청에서 slug 해석·리포트 집계를
//   각각 다시 돌리던 중복 제거(요청 단위 dedup — reports-pool.ts 의 cache() 패턴과 동일).
const resolveProcedure = cache(
  async (raw: string): Promise<{ ko: string; en: string } | null> => {
    const v = decodeURIComponent(raw).trim();
    if (!v) return null;
    // 화이트리스트 미충족(메타문자 포함 등) → 조회 없이 미존재 취급(페이지는 notFound()).
    if (!PROCEDURE_SLUG_RE.test(v)) return null;
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("tag_dictionary")
      .select("ko, en")
      .or(`en.eq.${v.toLowerCase()},ko.eq.${v}`)
      .eq("is_procedure", true)
      .maybeSingle<{ ko: string; en: string }>();
    return data ? { ko: data.ko, en: data.en } : null;
  },
);

/** getProcedureReport 요청 단위 cache 래퍼 — ko 만 인자(supabase 클라는 내부 생성,
 *   인자로 넘기면 호출부마다 참조가 달라 캐시 미스). 메타·본문이 집계 1회 공유. */
const getProcedureReportCached = cache(async (ko: string) => {
  const supabase = await createSupabaseServerClient();
  return getProcedureReport(supabase, ko);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) return { title: "찾을 수 없는 시술 리포트" };
  const { ko } = resolved;
  const report = await getProcedureReportCached(ko);
  if (!report) return { title: `${ko} 시술 리포트`, robots: { index: false, follow: true } };

  // canonical = 한글 슬러그 (2026-06-05). 영문 en 은 308 로 한글로 보내는 리다이렉트 전용.
  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
  // 주제(시술·후기수) first · 브랜드("피부텐텐 리포트") last. 수치 전부 라이브 집계.
  const title = `${ko} 후기 ${report.count}건 | 피부텐텐 리포트`;
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const revisitPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;
  const desc = `재시술 의향 ${revisitPct}% · 평균 만족도 ${report.avgSatisfaction.toFixed(
    1,
  )}/5 · 통증·다운타임까지 실제 경험자 데이터로 정리.`;
  return {
    // absolute — 루트 레이아웃 "%s | 피부텐텐" 템플릿 중복 방지(이미 '피부텐텐 리포트' 포함).
    title: { absolute: title },
    description: desc,
    alternates: { canonical: url },
    // SEO 게이트(원장 확정안) — 후기 N<FEED_MIN_REVIEWS(=4, 허브 노출 임계와 동일)는
    //   저표본 thin 페이지라 noindex,follow(링크 신호는 흘림). 나머지 메타는 그대로.
    robots:
      report.count < FEED_MIN_REVIEWS
        ? { index: false, follow: true }
        : { index: true, follow: true },
    // 2026-06-16: openGraph/twitter 인라인 작성 → lib/og-meta.ts 헬퍼로 정합화.
    //   OG 이미지(기본 /og.png, 의사별 커스텀 없음 → null) + twitter card=summary_large_image.
    ...buildSocialMeta({
      title,
      description: desc,
      canonical: url,
      ogImage: buildOgImage(null),
      ogType: "article",
    }),
  };
}

export default async function ProcedureReportPage({ params }: Props) {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) notFound();
  const { ko, en } = resolved;

  // 영문 en → 한글 ko 308 영구 리다이렉트는 middleware.ts 가 처리(페이지 레벨 redirect 는
  //   스트리밍 SSR 에서 200+meta-refresh 로 폴백 → 하드 308 불가). 이 페이지는 ko 만 받는다.

  const supabase = await createSupabaseServerClient();

  // report 를 먼저 단독 await → 없으면 notFound() 로 즉시 종료(존재하지 않는 시술 슬러그·크롤러
  //   요청 시 이후 쿼리들을 헛돌리지 않는다). 요청 단위 cache — generateMetadata 와 집계 공유.
  const report = await getProcedureReportCached(ko);
  if (!report) notFound();

  // ── R4-1 병렬화 (2026-07-04) — report 확정 이후 순차 await 11회를 실제 데이터 의존
  //   그래프대로 3단계 Promise.all 로 재배선. 쿼리 내용·조건은 전부 무변경(실행 시점만 병렬).
  //   실패 의미도 종전과 동일 — supabase-js 쿼리·RPC·auth 는 reject 하지 않고
  //   { data: null } 로 오류를 반환하므로, Promise.all 묶음이 한 조회 실패로 페이지를
  //   죽이는 경로는 생기지 않는다(개별 ?? 폴백이 종전 그대로 degrade 처리).
  const PAGE_SIZE = 10;
  // 비슷한 시술의 원천 2종(직속자식·효과공유 rows)을 조건부 발사하기 위한 선계산 —
  //   topEffect 는 report 파생값이라 추가 조회 없음.
  const topEffect = report.effects[0]?.label ?? null;

  // ── 단계 1: ko·report 만으로 가능한 독립 조회 병렬 ──
  const [cardIds, authRes, idxTagsRes, doctorQAsRes, kidsRes, effectRowsRes] =
    await Promise.all([
      // 개별 후기 스트림 원천 — 작업 D 롤업: 집계와 동일한 procedure_ko family 기준.
      //   procedure_family RPC 는 요청 단위 cache 로 report 집계와 1회 공유(추가 왕복 0).
      getFamilyReviewCardIds(supabase, ko),
      // viewer — reviewLiked 산출용. 데이터 의존이 없어 단계 1 로 상향(기존엔 후기 조회 뒤
      //   reviews.length>0 게이트 안에서 실행 — report 존재 ⇒ 발행 후기 ≥1 이므로 사실상 동조건).
      //   ⚠ 이 전제(getProcedureReport 가 후기 0건이면 null)가 바뀌면 이 상향도 재검토.
      supabase.auth.getUser(),
      // /topics(전문의 Q&A 허브) 얇은 링크 — 실제 존재(의사 qa ≥4 = get_indexable_tags 포함)할 때만.
      //   /topics 의 404 게이트(MIN_DOCTOR_POSTS=4)와 동일 기준 → 깨진 링크 0.
      supabase.rpc("get_indexable_tags", { p_min_count: 4 }),
      // 의사 Q&A — 해당 시술 키워드 포함, 인기순 최대 10개.
      supabase
        .from("cards")
        .select(CARD_LIST_SELECT)
        .eq("category", "qa")
        .eq("status", "published")
        .not("doctor_id", "is", null)
        .contains("keywords", [ko])
        .order("like_count", { ascending: false })
        .order("view_count", { ascending: false })
        .limit(10)
        .returns<CardData[]>(),
      // 비슷한 시술 제외용 — 자기 시술 + 직속 자식 (topEffect 없으면 미발사 — 기존 게이트 유지).
      topEffect
        ? supabase.from("tag_dictionary").select("ko").eq("parent_ko", ko)
        : Promise.resolve({ data: null }),
      // 비슷한 시술 원천 — top effect 공유 후기 rows (topEffect 없으면 미발사).
      topEffect
        ? supabase
            .from("procedure_reviews")
            .select("procedure_ko, revisit, cards!inner(status, deleted_at)")
            .contains("effect_areas", [topEffect])
            .eq("cards.status", "published")
            .is("cards.deleted_at", null)
            .limit(4000)
            .returns<{ procedure_ko: string; revisit: string }[]>()
        : Promise.resolve({ data: null }),
    ]);

  const reviewTotal = cardIds.length;
  const viewer = authRes.data?.user ?? null; // 예외적 auth 상태에서 data 부재 방어 (검수 반영)
  const topicsExists =
    Array.isArray(idxTagsRes.data) &&
    (idxTagsRes.data as Array<{ keyword: string }>).some((t) => t.keyword === ko);
  const doctorQAs = doctorQAsRes.data ?? [];

  // 비슷한 시술 — top effect 공유, JS 집계, 마이그레이션 없음. topEffect 가 없으면 원천이
  //   null 이라 아래 집계가 전부 빈 값 → kos=[] → 단계 2 후속 조회 미발사 → similar=[](구 동작 동일).
  const exclude = new Set<string>([
    ko,
    ...((kidsRes.data ?? []) as { ko: string }[]).map((k) => k.ko),
  ]);
  const agg = new Map<string, { c: number; y: number }>();
  for (const r of effectRowsRes.data ?? []) {
    if (exclude.has(r.procedure_ko)) continue;
    const a = agg.get(r.procedure_ko) ?? { c: 0, y: 0 };
    a.c++;
    if (r.revisit === "yes") a.y++;
    agg.set(r.procedure_ko, a);
  }
  const top = [...agg.entries()]
    .filter(([, a]) => a.c >= 3)
    .sort((a, b) => b[1].c - a[1].c)
    .slice(0, 5);
  const kos = top.map(([k]) => k);

  // ── 단계 2: 단계 1 결과 의존 조회 병렬 (후기 첫 페이지 ← cardIds, 비슷한시술 메타·분모 ← kos) ──
  const [reviewsRes, tgRes, totRes] = await Promise.all([
    // 첫 10개만 서버 렌더(크롤러·비로그인 노출) + 전체 count(reviewTotal) → 무한스크롤 hasMore 판정.
    cardIds.length > 0
      ? supabase
          .from("cards")
          .select(CARD_LIST_SELECT)
          .in("id", cardIds)
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1)
          .returns<CardData[]>()
      : Promise.resolve({ data: null }),
    kos.length
      ? supabase.from("tag_dictionary").select("ko, en, category").in("ko", kos)
      : Promise.resolve({ data: null }),
    // 후보 시술별 전체 발행 후기 수(효과 비율의 분모)
    kos.length
      ? supabase
          .from("procedure_reviews")
          .select("procedure_ko, cards!inner(status, deleted_at)")
          .in("procedure_ko", kos)
          .eq("cards.status", "published")
          .is("cards.deleted_at", null)
          .limit(6000)
          .returns<{ procedure_ko: string }[]>()
      : Promise.resolve({ data: null }),
  ]);
  const reviews: CardData[] = reviewsRes.data ?? [];

  const metaMap = new Map<string, { en: string; category: ProcedureSlug | null }>();
  const totMap = new Map<string, number>();
  for (const t of (tgRes.data ?? []) as {
    ko: string;
    en: string | null;
    category: string | null;
  }[]) {
    metaMap.set(t.ko, { en: t.en ?? "", category: categoryKoToSlug(t.category) });
  }
  for (const r of totRes.data ?? [])
    totMap.set(r.procedure_ko, (totMap.get(r.procedure_ko) ?? 0) + 1);

  const similar: {
    ko: string;
    en: string;
    count: number;
    effectPct: number;
    category: ProcedureSlug | null;
  }[] = top.map(([k, a]) => {
    const total = totMap.get(k) ?? a.c;
    return {
      ko: k,
      en: metaMap.get(k)?.en ?? "",
      count: total,
      // 이 시술 후기 중 공유 효과(top effect)를 꼽은 비율.
      effectPct: Math.min(100, Math.round((a.c / Math.max(1, total)) * 100)),
      category: metaMap.get(k)?.category ?? null,
    };
  });

  // ── 단계 3: 후기 첫 페이지(10건 id) 의존 조회 병렬 ──
  //   viewer 좋아요(단독 글과 같은 card_likes 행) + 작성자 나이·성별(작성자 통계와 동일
  //   SECURITY DEFINER RPC — .returns 대신 명시 캐스팅(as), 제네릭 미적용 회피)
  //   + 댓글 수(D6, 2026-07-08).
  const reviewLiked: Record<number, boolean> = {};
  const reviewDemo: Record<number, { gender: string | null; ageDecade: number | null }> = {};
  if (reviews.length > 0) {
    const reviewIds = reviews.map((r) => r.id);
    const [st, demoRes, cmtRes] = await Promise.all([
      fetchViewerStatesRecord(supabase, viewer?.id ?? null, reviewIds),
      supabase.rpc("get_review_author_demographics", { p_card_ids: reviewIds }),
      // 댓글 수 집계(D6) — cards 에 comment_count 컬럼이 없어(카드 표시가 항상 0 인 결함)
      //   comments 테이블에서 카드별 GROUP BY(JS 집계). visible 만 — comments_select RLS
      //   첫 조건(status='visible')과 동일 게이트라 anon 포함 권한 문제 없음.
      supabase.from("comments").select("card_id").in("card_id", reviewIds).eq("status", "visible"),
    ]);
    for (const r of reviews) reviewLiked[r.id] = !!st[r.id]?.liked;
    const demoRows = (demoRes.data ?? []) as {
      card_id: number;
      gender: string | null;
      age_decade: number | null;
    }[];
    for (const d of demoRows) reviewDemo[d.card_id] = { gender: d.gender, ageDecade: d.age_decade };
    // 카드 데이터에 병합 — ReportsReviewCard 초기 commentCount + '추천순' 정렬 댓글 성분 정합.
    const commentCounts: Record<number, number> = {};
    for (const c of (cmtRes.data ?? []) as { card_id: number }[])
      commentCounts[c.card_id] = (commentCounts[c.card_id] ?? 0) + 1;
    for (const r of reviews) r.comment_count = commentCounts[r.id] ?? 0;
  }

  // JSON-LD — MedicalWebPage + Service(MedicalProcedure) (2026-06-05, Product 폐기).
  //   의료 시술에 Product 스키마는 구글 정책 오용 소지 → 의료 페이지 + 시술(Service) 로 전환.
  //   별점(AggregateRating)·재시술%·통증은 페이지·AI 인용 신호로 유지. 모든 수치 라이브 집계.
  //   provider 는 layout 의 Organization(@id #organization) 참조만(신규 정의 없음).
  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const revisitPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;
  // JSON-LD 날짜 — datePublished 는 리포트 앵커 카드(type=review_summary)의 생성 시각(있을 때만),
  //   dateModified 는 이 페이지가 이미 받은 최신 후기 시각(reviews 가 created_at desc 라 [0]이 최신).
  //   후기 목록이 비면(이론상 report 존재 시 ≥1이나 방어) 요청 시점 폴백(구 동작 유지).
  const latestReviewAt = reviews[0]?.created_at ?? null;
  const anchorPublishedAt = report.anchor?.created_at ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    // @graph — MedicalWebPage + BreadcrumbList 를 독립 노드로 분리(Google 리치결과 인식↑).
    "@graph": [
      {
        "@type": "MedicalWebPage",
        "@id": `${url}#webpage`,
        name: `${ko} 후기 리포트 | 피부텐텐`,
        url,
        inLanguage: "ko-KR",
        // 사이트 #website 노드 연결(doctor 라우트와 동일 패턴) — 페이지 그래프 결속.
        isPartOf: { "@id": `${SITE_URL}/#website` },
        // 게시 책임 주체 — 전역 layout 의 #organization(SSOT) 참조만(노드 재정의 금지 → @id 충돌 0).
        publisher: { "@id": `${SITE_URL}/#organization` },
        ...(anchorPublishedAt ? { datePublished: anchorPublishedAt } : {}),
        // 집계 갱신 신호 — 최신 후기 시각(가짜 '요청 시점' 대신 실제 데이터 변동 시각). AI freshness.
        dateModified: latestReviewAt ?? new Date().toISOString(),
        mainEntity: {
          "@type": "Service",
          additionalType: "https://schema.org/MedicalProcedure",
          name: ko,
          // tag_dictionary(is_procedure=true) 에서 파생한 category 값 그대로(lifting/skinbooster/filler/contour/laser/other). 미분류면 생략.
          ...(report.category ? { category: report.category } : {}),
          provider: { "@id": `${SITE_URL}/#organization` },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: report.avgSatisfaction.toFixed(1),
            bestRating: 5,
            ratingCount: report.count,
          },
          additionalProperty: [
            { "@type": "PropertyValue", name: "재시술 의향", value: `${revisitPct}%` },
            {
              "@type": "PropertyValue",
              name: "평균 통증",
              value: Number(report.avgPain.toFixed(1)),
              maxValue: 5,
            },
          ],
        },
        // BreadcrumbList 는 @graph 독립 노드 → @id 참조.
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "홈", item: `${SITE_URL}/` },
          // /reports 허브(인덱스) 존재(200) → item 링크 부여(예전 name-only 깨진링크 방지 주석 폐기).
          { "@type": "ListItem", position: 2, name: "시술 리포트", item: `${SITE_URL}/reports` },
          { "@type": "ListItem", position: 3, name: ko, item: url },
        ],
      },
    ],
  };

  // JSON-LD <script> 는 server 에 남겨 SEO 신호 100% 보존. AppShell + 사이드바는 공유 layout 이
  //   제공하고, ReportsDetailView 는 콘텐츠만 반환(정보 구조·데이터 무변경).
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <ReportsDetailView
        ko={ko}
        en={en}
        report={report}
        reviews={reviews}
        reviewLiked={reviewLiked}
        reviewDemo={reviewDemo}
        reviewTotal={reviewTotal}
        topicsExists={topicsExists}
        doctorQAs={doctorQAs}
        similar={similar}
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getProcedureReport,
  getFamilyReviewCardIds,
  getReviewSummaryFeedPool,
} from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import type { ProcedureSlug } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import ReportsDetailView from "./ReportsDetailView";

// tag_dictionary.category(한글) → 테마 slug. procedure-report.ts 의 매핑과 동일(SSOT 정합).
//   '비슷한 시술' 후보 카드의 카테고리 색을 정하는 데만 쓰인다.
function catSlug(ko: string | null): ProcedureSlug | null {
  switch (ko) {
    case "리프팅": return "lifting";
    case "스킨부스터": return "skinbooster";
    case "필러·볼륨": return "filler";
    case "주름·윤곽": return "contour";
    case "레이저": return "laser";
    case "기타": return "other";
    default: return null;
  }
}

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

async function resolveProcedure(
  raw: string,
): Promise<{ ko: string; en: string } | null> {
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
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure } = await params;
  const resolved = await resolveProcedure(procedure);
  if (!resolved) return { title: "찾을 수 없는 시술 리포트" };
  const { ko } = resolved;
  const supabase = await createSupabaseServerClient();
  const report = await getProcedureReport(supabase, ko);
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
    // absolute — 루트 레이아웃 "피부텐텐 | %s" 템플릿 중복 방지(이미 '피부텐텐 리포트' 포함).
    title: { absolute: title },
    description: desc,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
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
  //   요청 시 이후 쿼리들을 헛돌리지 않는다).
  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 개별 후기 스트림 — 작업 D 롤업: 집계와 동일한 procedure_ko family 기준(카드 id IN).
  //   첫 10개만 서버 렌더(크롤러·비로그인 노출) + 전체 count → 무한스크롤 hasMore 판정.
  const PAGE_SIZE = 10;
  const cardIds = await getFamilyReviewCardIds(supabase, ko);
  const reviewTotal = cardIds.length;
  const reviews: CardData[] =
    cardIds.length > 0
      ? ((
          await supabase
            .from("cards")
            .select(CARD_LIST_SELECT)
            .in("id", cardIds)
            .order("created_at", { ascending: false })
            .range(0, PAGE_SIZE - 1)
            .returns<CardData[]>()
        ).data ?? [])
      : [];

  // 시술 리포트 후기 — viewer 좋아요 여부 일괄 조회(단독 글과 같은 card_likes 행).
  const reviewLiked: Record<number, boolean> = {};
  if (reviews.length > 0) {
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    const st = await fetchViewerStatesRecord(
      supabase,
      viewer?.id ?? null,
      reviews.map((r) => r.id),
    );
    for (const r of reviews) reviewLiked[r.id] = !!st[r.id]?.liked;
  }

  // 작성자 나이·성별(작성자 통계와 동일 SECURITY DEFINER RPC) — 후기 카드 표시용.
  //   RPC 타입은 .returns 대신 명시 캐스팅(as) — 제네릭 미적용 회피.
  const reviewDemo: Record<number, { gender: string | null; ageDecade: number | null }> = {};
  if (reviews.length > 0) {
    const { data: demoRowsRaw } = await supabase.rpc("get_review_author_demographics", {
      p_card_ids: reviews.map((r) => r.id),
    });
    const demoRows = (demoRowsRaw ?? []) as {
      card_id: number;
      gender: string | null;
      age_decade: number | null;
    }[];
    for (const d of demoRows) reviewDemo[d.card_id] = { gender: d.gender, ageDecade: d.age_decade };
  }

  // /topics(전문의 Q&A 허브) 얇은 링크 — 실제 존재(의사 qa ≥4 = get_indexable_tags 포함)할 때만.
  //   /topics 의 404 게이트(MIN_DOCTOR_POSTS=4)와 동일 기준 → 깨진 링크 0.
  const { data: idxTags } = await supabase.rpc("get_indexable_tags", { p_min_count: 4 });
  const topicsExists =
    Array.isArray(idxTags) &&
    (idxTags as Array<{ keyword: string }>).some((t) => t.keyword === ko);

  // 의사 Q&A — 해당 시술 키워드 포함, 인기순 최대 10개.
  const { data: doctorQAsRaw } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("category", "qa")
    .eq("status", "published")
    .not("doctor_id", "is", null)
    .contains("keywords", [ko])
    .order("like_count", { ascending: false })
    .order("view_count", { ascending: false })
    .limit(10)
    .returns<CardData[]>();
  const doctorQAs = doctorQAsRaw ?? [];

  // 비슷한 시술 — top effect 공유, JS 집계, 마이그레이션 없음.
  const topEffect = report.effects[0]?.label ?? null;
  let similar: {
    ko: string;
    en: string;
    count: number;
    effectPct: number;
    category: ProcedureSlug | null;
  }[] = [];
  if (topEffect) {
    // 자기 시술 + 직속 자식 제외
    const { data: kids } = await supabase
      .from("tag_dictionary")
      .select("ko")
      .eq("parent_ko", ko);
    const exclude = new Set<string>([
      ko,
      ...((kids ?? []) as { ko: string }[]).map((k) => k.ko),
    ]);

    const { data: rows } = await supabase
      .from("procedure_reviews")
      .select("procedure_ko, revisit, cards!inner(status, deleted_at)")
      .contains("effect_areas", [topEffect])
      .eq("cards.status", "published")
      .is("cards.deleted_at", null)
      .limit(4000)
      .returns<{ procedure_ko: string; revisit: string }[]>();

    const agg = new Map<string, { c: number; y: number }>();
    for (const r of rows ?? []) {
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
    const metaMap = new Map<string, { en: string; category: ProcedureSlug | null }>();
    const totMap = new Map<string, number>();
    if (kos.length) {
      const { data: tg } = await supabase
        .from("tag_dictionary")
        .select("ko, en, category")
        .in("ko", kos);
      for (const t of (tg ?? []) as {
        ko: string;
        en: string | null;
        category: string | null;
      }[]) {
        metaMap.set(t.ko, { en: t.en ?? "", category: catSlug(t.category) });
      }
      // 후보 시술별 전체 발행 후기 수(효과 비율의 분모)
      const { data: totRows } = await supabase
        .from("procedure_reviews")
        .select("procedure_ko, cards!inner(status, deleted_at)")
        .in("procedure_ko", kos)
        .eq("cards.status", "published")
        .is("cards.deleted_at", null)
        .limit(6000)
        .returns<{ procedure_ko: string }[]>();
      for (const r of totRows ?? []) totMap.set(r.procedure_ko, (totMap.get(r.procedure_ko) ?? 0) + 1);
    }

    similar = top.map(([k, a]) => {
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
  }

  // 사이드바 '후기 많은 시술'(인덱스와 동일 2단 레이아웃).
  const pool = await getReviewSummaryFeedPool(supabase);
  const topProcedures = [...pool]
    .sort((a, b) => b.count - a.count)
    .slice(0, 7)
    .map((r) => ({ ko: r.procedureKo, count: r.count }));

  // JSON-LD — MedicalWebPage + Service(MedicalProcedure) (2026-06-05, Product 폐기).
  //   의료 시술에 Product 스키마는 구글 정책 오용 소지 → 의료 페이지 + 시술(Service) 로 전환.
  //   별점(AggregateRating)·재시술%·통증은 페이지·AI 인용 신호로 유지. 모든 수치 라이브 집계.
  //   provider 는 layout 의 Organization(@id #organization) 참조만(신규 정의 없음).
  const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
  const rTotal = report.revisit.yes + report.revisit.maybe + report.revisit.no;
  const revisitPct = rTotal > 0 ? Math.round((report.revisit.yes / rTotal) * 100) : 0;
  const jsonLd = {
    "@context": "https://schema.org",
    // @graph — MedicalWebPage + BreadcrumbList 를 독립 노드로 분리(Google 리치결과 인식↑).
    //   datePublished 는 리포트가 실시간 집계(저장된 발행일 없음)라 생략 — 가짜 날짜 미기입.
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
        // 집계 갱신 신호 — 요청 시점(실시간 집계라 항상 최신). AI freshness.
        dateModified: new Date().toISOString(),
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

  // JSON-LD <script> 는 server 에 남겨 SEO 신호 100% 보존. 본문은 새 디자인 뷰(ReportsDetailView)가
  //   AppShell 로 감싸 표시(정보 구조·데이터 무변경). DoctorDashboardView 선례 동일 패턴.
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
        topProcedures={topProcedures}
      />
    </>
  );
}

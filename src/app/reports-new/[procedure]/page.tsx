import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcedureReport, getFamilyReviewCardIds, getReviewSummaryFeedPool } from "@/lib/procedure-report";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import type { ProcedureSlug } from "@/lib/categories";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import ReportsNewDetailView from "./ReportsNewDetailView";

// tag_dictionary.category(한글) → 테마 slug. procedure-report.ts 의 매핑과 동일(SSOT 정합).
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

/**
 * /reports-new/[시술] — 시술 전체 리포트 개선판 (임시 라우트, 서버 컴포넌트).
 *
 * 정식 /reports/[procedure](공용 ProcedureReportView, 다른 세션 작업 중)와 별개로,
 * 목업(전달용/thermage-report.html)의 풀 에디토리얼 리포트를 독립 구현해 검토용으로 올린다.
 *   - 데이터는 동일 함수(getProcedureReport)만 재사용(공용 뷰/카드 비의존).
 *   - 임시라 noindex + JSON-LD 없음(정식 페이지와 색인·구조화 데이터 중복 방지).
 *   - 승격 시 정식 /reports/[procedure]로 통합 예정.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ procedure: string }> };

// 정식 페이지와 동일 화이트리스트(.or() 보간 방어). 한글 URL 비파괴.
const PROCEDURE_SLUG_RE = /^[가-힣a-zA-Z0-9 ·-]+$/;

async function resolveProcedure(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  raw: string,
): Promise<{ ko: string; en: string } | null> {
  const v = decodeURIComponent(raw).trim();
  if (!v || !PROCEDURE_SLUG_RE.test(v)) return null;
  const { data } = await supabase
    .from("tag_dictionary")
    .select("ko, en")
    .or(`en.eq.${v.toLowerCase()},ko.eq.${v}`)
    .eq("is_procedure", true)
    .maybeSingle<{ ko: string; en: string }>();
  return data ? { ko: data.ko, en: data.en } : null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "시술 리포트 (미리보기) | 피부텐텐" },
    description: "시술 전체 리포트 개선판 미리보기입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function ReportsNewDetailPage({ params }: Props) {
  const { procedure } = await params;
  const supabase = await createSupabaseServerClient();

  const resolved = await resolveProcedure(supabase, procedure);
  if (!resolved) notFound();
  const { ko, en } = resolved;

  const report = await getProcedureReport(supabase, ko);
  if (!report) notFound();

  // 후기 첫 10개 서버 렌더 + 전체 count(더 보기 판정). 정식 페이지와 동일 family 롤업.
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

  // 작성자 나이·성별(작성자 통계와 동일 SECURITY DEFINER 경로) — 후기 카드 표시용.
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

  // 전문의 Q&A 얇은 링크 — 실제 존재(의사 qa ≥4)할 때만(정식 페이지와 동일 게이트).
  const { data: idxTags } = await supabase.rpc("get_indexable_tags", {
    p_min_count: 4,
  });
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

  return (
    <ReportsNewDetailView
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
  );
}

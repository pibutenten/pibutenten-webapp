import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { EFFECT_NONE_LABEL } from "@/lib/review-options";
import {
  buildHeadlinePool,
  pickHeadline,
  toSignals,
} from "@/lib/report-headline";
import ReportsNewView from "./ReportsNewView";

/**
 * /reports-new — 시술 리포트 인덱스 개선판 (임시 라우트, 서버 컴포넌트).
 *
 * 검토 후 /reports 로 승격 예정. 데이터 배선은 기존 허브(app/reports/page.tsx)를 계승:
 *   getReviewSummaryFeedPool(N≥4 게이트 + family 롤업) → count desc 정렬, force-dynamic.
 *
 * 개선점:
 *   1) 각 시술에 회전 헤드라인(report-headline 엔진) 1개를 서버에서 확정해 prop 전달
 *      (요청마다 랜덤 → 매 방문 변경, SSR/CSR 일치).
 *   2) 대표 효과(top1/top2 + 비율)를 경량 조회로 구해 헤드라인 효과 분기에 주입
 *      (컴팩트 풀엔 effects 가 비어 있어 마이그·RPC 없이 procedure_reviews 직접 집계).
 *   3) 사이드바(ReportsIndexSidebar) + 정렬 칩 + 카테고리 필터(View).
 *
 * 임시 라우트라 noindex(정식 /reports 와 SEO 중복·색인 방지). JSON-LD 불필요.
 */
export const dynamic = "force-dynamic";

/** 시술별 대표 효과(top1/top2 라벨 + 비율%). 비율 = 효과 count / 그 시술 family 후기수(n). */
type TopEffect = { label: string; pct: number };
type TopEffectPair = { top1: TopEffect | null; top2: TopEffect | null };

/** count desc 정렬된 자격 시술 목록(N≥4). 동률은 시술명 ko 사전순으로 안정 정렬. */
async function loadPool(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ProcedureReport[]> {
  const pool = await getReviewSummaryFeedPool(supabase);
  return [...pool].sort(
    (a, b) => b.count - a.count || a.procedureKo.localeCompare(b.procedureKo, "ko"),
  );
}

/**
 * 대표 효과 경량 조회 — 마이그·RPC 신설 없이.
 *   1) tag_dictionary(is_procedure)에서 (ko, parent_ko)로 family 맵(부모→자기+직속하위) 구성.
 *      pool 의 ko 와 procedure_family RPC(0225) 가 같은 규칙(부모=자기+직속하위, 자식=자기).
 *   2) procedure_reviews(published·미삭제)의 (procedure_ko, effect_areas)를 한 번에 조회.
 *   3) pool 각 시술의 family 에 속한 후기의 effect_areas 를 합산('없음' 제외) → top1/top2 + pct.
 *      pct 분모 = pool 의 count(=family review_count) — 헤드라인 e1s 와 정합(분포 % 와 동일 기준).
 */
async function loadTopEffects(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  pool: ProcedureReport[],
): Promise<Map<string, TopEffectPair>> {
  const result = new Map<string, TopEffectPair>();
  if (pool.length === 0) return result;

  // 1) family 맵 — 부모 ko → [자기, ...직속하위 ko]. (procedure_family RPC 와 동일 규칙)
  const { data: taxData } = await supabase
    .from("tag_dictionary")
    .select("ko, parent_ko")
    .eq("is_procedure", true)
    .returns<{ ko: string; parent_ko: string | null }[]>();
  const childrenOf = new Map<string, string[]>();
  for (const row of taxData ?? []) {
    if (row.parent_ko) {
      const arr = childrenOf.get(row.parent_ko) ?? [];
      arr.push(row.ko);
      childrenOf.set(row.parent_ko, arr);
    }
  }
  const familyOf = (ko: string): string[] => [ko, ...(childrenOf.get(ko) ?? [])];

  // 조회할 procedure_ko 의 합집합(pool 시술들의 family 전체).
  const needed = new Set<string>();
  for (const r of pool) for (const ko of familyOf(r.procedureKo)) needed.add(ko);

  // 2) effect_areas 집계 — published·미삭제 review 카드만(pool count 와 동일 모집단).
  const { data: rows } = await supabase
    .from("procedure_reviews")
    .select(
      "procedure_ko, effect_areas, card:cards!inner(status, deleted_at)",
    )
    .in("procedure_ko", [...needed])
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<
      {
        procedure_ko: string;
        effect_areas: string[] | null;
        card: { status: string | null; deleted_at: string | null } | null;
      }[]
    >();

  // procedure_ko → (effect → count) 누적.
  const byKo = new Map<string, Map<string, number>>();
  for (const row of rows ?? []) {
    const ko = row.procedure_ko;
    if (!ko) continue;
    let m = byKo.get(ko);
    if (!m) {
      m = new Map();
      byKo.set(ko, m);
    }
    for (const e of row.effect_areas ?? []) {
      if (typeof e !== "string" || !e.trim() || e === EFFECT_NONE_LABEL) continue;
      m.set(e, (m.get(e) ?? 0) + 1);
    }
  }

  // 3) pool 각 시술 — family 합산 → top1/top2(pct = count / pool count).
  for (const r of pool) {
    const merged = new Map<string, number>();
    for (const ko of familyOf(r.procedureKo)) {
      const m = byKo.get(ko);
      if (!m) continue;
      for (const [label, c] of m) merged.set(label, (merged.get(label) ?? 0) + c);
    }
    const sorted = [...merged.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"),
    );
    const n = Math.max(1, r.count);
    const toEffect = (entry: [string, number] | undefined): TopEffect | null =>
      entry ? { label: entry[0], pct: Math.round((entry[1] / n) * 100) } : null;
    result.set(r.procedureKo, {
      top1: toEffect(sorted[0]),
      top2: toEffect(sorted[1]),
    });
  }
  return result;
}

export async function generateMetadata(): Promise<Metadata> {
  // 임시 미리보기 라우트 — 정식 /reports 와의 색인 중복 방지로 항상 noindex.
  return {
    title: { absolute: "시술 리포트 (미리보기) | 피부텐텐" },
    description: "시술 리포트 인덱스 개선판 미리보기입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function ReportsNewPage() {
  const supabase = await createSupabaseServerClient();
  const pool = await loadPool(supabase);
  const topEffects = await loadTopEffects(supabase, pool);

  // 각 시술 — 대표 효과 주입 → 시그널 → 풀 → 서버 랜덤픽 1개(요청마다 변경).
  const items = pool.map((report) => {
    const eff = topEffects.get(report.procedureKo) ?? { top1: null, top2: null };
    const signals = toSignals(report, eff.top1, eff.top2);
    const headlinePool = buildHeadlinePool(signals);
    const headline = pickHeadline(headlinePool); // seed 없음 → Math.random(요청마다)
    return { report, headline };
  });

  // 사이드바 '후기 많은 시술' — count desc 상위 7개.
  const topProcedures = pool
    .slice(0, 7)
    .map((r) => ({ ko: r.procedureKo, count: r.count }));

  return <ReportsNewView items={items} topProcedures={topProcedures} />;
}

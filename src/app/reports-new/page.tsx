import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { EFFECT_NONE_LABEL, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { buildHeadlinePool, pickHeadline, toSignals } from "@/lib/report-headline";
import ReportsNewView from "./ReportsNewView";

/**
 * /reports-new — 시술 리포트 인덱스 개선판 (임시 라우트, 서버 컴포넌트).
 *
 * 검토 후 /reports 로 승격 예정. 데이터 배선은 기존 허브(app/reports/page.tsx)를 계승:
 *   getReviewSummaryFeedPool(N≥4 게이트 + family 롤업) → count desc 정렬, force-dynamic.
 *
 * 개선점:
 *   1) 각 시술 회전 헤드라인(report-headline)을 서버에서 확정해 prop 전달(요청마다 랜덤).
 *   2) 대표 효과(top3 + 비율) + 효과 발현 시점(최다 구간)을 서버에서 미리 집계해 prop 전달
 *      → 카드 펼침이 즉시 표시(클라 lazy fetch 제거 = "멈췄다 뜸" 해소). 컴팩트 풀엔 효과/시점이
 *      없어 procedure_reviews 직접 집계(마이그·RPC 없음).
 *   3) 사이드바 + 정렬 칩 + 카테고리 필터(View).
 *
 * 임시 라우트라 noindex(정식 /reports 색인 중복 방지). JSON-LD 불필요.
 */
export const dynamic = "force-dynamic";

type TopEffect = { label: string; pct: number };
/** 카드 펼침용 서버 선집계 — 대표 효과 top3 + 효과 발현 최다 시점 라벨. */
type Extras = { effects: TopEffect[]; onsetLabel: string | null };

/** count desc 정렬된 자격 시술 목록(N≥4). 동률은 시술명 ko 사전순 안정 정렬. */
async function loadPool(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ProcedureReport[]> {
  const pool = await getReviewSummaryFeedPool(supabase);
  return [...pool].sort(
    (a, b) => b.count - a.count || a.procedureKo.localeCompare(b.procedureKo, "ko"),
  );
}

/**
 * 대표 효과 top3 + 효과 발현 최다 시점 — 마이그·RPC 없이 1회 조회.
 *   1) tag_dictionary(is_procedure)의 (ko, parent_ko)로 family 맵(부모=자기+직속하위, procedure_family 0225 규칙).
 *   2) procedure_reviews(published·미삭제)의 (procedure_ko, effect_areas, effect_onset) 한 번에 조회.
 *   3) pool 각 시술 family 합산 → 효과 top3(pct=count/pool.count) + 효과시점 0~3구간 최다 라벨.
 */
async function loadExtras(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  pool: ProcedureReport[],
): Promise<Map<string, Extras>> {
  const result = new Map<string, Extras>();
  if (pool.length === 0) return result;

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

  const needed = new Set<string>();
  for (const r of pool) for (const ko of familyOf(r.procedureKo)) needed.add(ko);

  const { data: rows } = await supabase
    .from("procedure_reviews")
    .select(
      "procedure_ko, effect_areas, effect_onset, card:cards!inner(status, deleted_at)",
    )
    .in("procedure_ko", [...needed])
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<
      {
        procedure_ko: string;
        effect_areas: string[] | null;
        effect_onset: string | null;
        card: { status: string | null; deleted_at: string | null } | null;
      }[]
    >();

  // 효과시점 슬러그 → 0~3 인덱스(still_watching 제외).
  const onsetIdx = new Map(
    EFFECT_ONSET_OPTIONS.slice(0, 4).map((o, i) => [o.value, i] as const),
  );
  const effByKo = new Map<string, Map<string, number>>();
  const onsetByKo = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const ko = row.procedure_ko;
    if (!ko) continue;
    let em = effByKo.get(ko);
    if (!em) {
      em = new Map();
      effByKo.set(ko, em);
    }
    for (const e of row.effect_areas ?? []) {
      if (typeof e !== "string" || !e.trim() || e === EFFECT_NONE_LABEL) continue;
      em.set(e, (em.get(e) ?? 0) + 1);
    }
    const oi = row.effect_onset ? onsetIdx.get(row.effect_onset) : undefined;
    if (oi !== undefined) {
      let oc = onsetByKo.get(ko);
      if (!oc) {
        oc = [0, 0, 0, 0];
        onsetByKo.set(ko, oc);
      }
      oc[oi] += 1;
    }
  }

  for (const r of pool) {
    const mergedEff = new Map<string, number>();
    const mergedOnset = [0, 0, 0, 0];
    for (const ko of familyOf(r.procedureKo)) {
      const em = effByKo.get(ko);
      if (em) for (const [label, c] of em) mergedEff.set(label, (mergedEff.get(label) ?? 0) + c);
      const oc = onsetByKo.get(ko);
      if (oc) for (let i = 0; i < 4; i++) mergedOnset[i] += oc[i] ?? 0;
    }
    const n = Math.max(1, r.count);
    const effects: TopEffect[] = [...mergedEff.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .slice(0, 3)
      .map(([label, c]) => ({ label, pct: Math.round((c / n) * 100) }));
    const onsetSum = mergedOnset.reduce((a, b) => a + b, 0);
    let onsetLabel: string | null = null;
    if (onsetSum > 0) {
      let idx = 0;
      for (let i = 1; i < 4; i++) if (mergedOnset[i] > mergedOnset[idx]) idx = i;
      onsetLabel = EFFECT_ONSET_OPTIONS[idx]?.label ?? null;
    }
    result.set(r.procedureKo, { effects, onsetLabel });
  }
  return result;
}

export async function generateMetadata(): Promise<Metadata> {
  // 임시 미리보기 라우트 — 정식 /reports 색인 중복 방지로 항상 noindex.
  return {
    title: { absolute: "시술 리포트 (미리보기) | 피부텐텐" },
    description: "시술 리포트 인덱스 개선판 미리보기입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function ReportsNewPage() {
  const supabase = await createSupabaseServerClient();
  const pool = await loadPool(supabase);
  const extras = await loadExtras(supabase, pool);

  // 시술별 — 대표효과 주입 → 시그널 → 풀 → 서버 랜덤픽 1개(요청마다). 효과·시점도 함께 prop.
  const items = pool.map((report) => {
    const ex = extras.get(report.procedureKo) ?? { effects: [], onsetLabel: null };
    const signals = toSignals(report, ex.effects[0] ?? null, ex.effects[1] ?? null);
    const headline = pickHeadline(buildHeadlinePool(signals));
    return { report, headline, effects: ex.effects, onsetLabel: ex.onsetLabel };
  });

  const topProcedures = pool
    .slice(0, 7)
    .map((r) => ({ ko: r.procedureKo, count: r.count }));

  return <ReportsNewView items={items} topProcedures={topProcedures} />;
}

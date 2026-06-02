/**
 * 시술별 후기 리포트 집계 — /reports/[procedure] 전용.
 *
 * 별도 집계 카드를 저장하지 않고(중복·동기화 누더기 방지) procedure_reviews 를 실시간 집계.
 * 발행(published)·미삭제 후기만 대상. count===0 이면 null.
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type Row = {
  satisfaction: number | null;
  pain: number | null;
  revisit: string | null;
  effect_areas: string[] | null;
  card: { status: string | null; deleted_at: string | null } | null;
};

export type ProcedureReport = {
  procedureKo: string;
  count: number;
  avgSatisfaction: number;
  /** index 0=1점 … 4=5점 */
  satisfactionDist: number[];
  avgPain: number;
  /** index 0=1단계(없음) … 4=5단계(심함) */
  painDist: number[];
  revisit: { yes: number; maybe: number; no: number };
  /** 빈도 desc 정렬 */
  effects: { label: string; count: number; pct: number }[];
};

export async function getProcedureReport(
  supabase: ServerClient,
  procedureKo: string,
): Promise<ProcedureReport | null> {
  const { data } = await supabase
    .from("procedure_reviews")
    .select(
      "satisfaction, pain, revisit, effect_areas, card:cards!inner(status, deleted_at)",
    )
    .eq("procedure_ko", procedureKo)
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<Row[]>();

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const n = rows.length;
  const satisfactionDist = [0, 0, 0, 0, 0];
  const painDist = [0, 0, 0, 0, 0];
  let satSum = 0;
  let painSum = 0;
  const revisit = { yes: 0, maybe: 0, no: 0 };
  const effectCount = new Map<string, number>();

  for (const r of rows) {
    const s = Number(r.satisfaction ?? 0);
    if (s >= 1 && s <= 5) {
      satisfactionDist[s - 1] += 1;
      satSum += s;
    }
    const p = Number(r.pain ?? 0);
    if (p >= 1 && p <= 5) {
      painDist[p - 1] += 1;
      painSum += p;
    }
    if (r.revisit === "yes") revisit.yes += 1;
    else if (r.revisit === "maybe") revisit.maybe += 1;
    else if (r.revisit === "no") revisit.no += 1;
    for (const e of r.effect_areas ?? []) {
      if (typeof e === "string" && e.trim()) {
        effectCount.set(e, (effectCount.get(e) ?? 0) + 1);
      }
    }
  }

  const effects = [...effectCount.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / n) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));

  return {
    procedureKo,
    count: n,
    avgSatisfaction: satSum / Math.max(1, satisfactionDist.reduce((a, b) => a + b, 0)),
    satisfactionDist,
    avgPain: painSum / Math.max(1, painDist.reduce((a, b) => a + b, 0)),
    painDist,
    revisit,
    effects,
  };
}

/**
 * 시술별 후기 리포트 집계 — /reports/[procedure] 전용.
 *
 * 별도 집계 카드를 저장하지 않고(중복·동기화 누더기 방지) procedure_reviews 를 실시간 집계.
 * 발행(published)·미삭제 후기만 대상. count===0 이면 null.
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DOWNTIME_OPTIONS,
  EFFECT_ONSET_OPTIONS,
  EFFECT_NONE_LABEL,
} from "@/lib/review-options";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type Row = {
  satisfaction: number | null;
  pain: number | null;
  revisit: string | null;
  effect_areas: string[] | null;
  downtime: string | null;
  effect_onset: string | null;
  card: { status: string | null; deleted_at: string | null } | null;
};

export type Demographics = {
  male: number;
  female: number;
  total: number;
  /** count>0 인 연령대만, 표시순. */
  ageBands: { label: string; count: number }[];
};

export type ProcedureCategory = "lifting" | "injectables";

export type ProcedureReport = {
  procedureKo: string;
  /** procedure_taxonomy.category — 카드 테두리 색 분기용. 미발견 시 null. */
  category: ProcedureCategory | null;
  count: number;
  avgSatisfaction: number;
  /** index 0=1점 … 4=5점 */
  satisfactionDist: number[];
  avgPain: number;
  /** index 0=1단계(없음) … 4=5단계(심함) */
  painDist: number[];
  revisit: { yes: number; maybe: number; no: number };
  /** 빈도 desc 정렬 ('없음'은 제외 — noEffectCount 로 분리) */
  effects: { label: string; count: number; pct: number }[];
  /** 효과 '없음'(EFFECT_NONE_LABEL)을 1개 이상 고른 후기 수 */
  noEffectCount: number;
  /** 다운타임 답변자 수(비-NULL). 0 이면 카드에서 섹션 숨김 */
  downtimeAnswered: number;
  /** DOWNTIME_OPTIONS 순서(0=바로 가능 … 4=2주 이상) count[5] */
  downtimeDist: number[];
  /** 효과시기 답변자 수(비-NULL). 0 이면 카드에서 섹션 숨김 */
  onsetAnswered: number;
  /** EFFECT_ONSET_OPTIONS 순서(0=시술 직후 … 4=아직 지켜보는 중) count[5] */
  onsetDist: number[];
  /** 작성자 인구통계 (집계 RPC — 개별 PII 비노출) */
  demographics: Demographics;
};

type DemoRow = {
  male: number; female: number; other_gender: number;
  age_u20: number; age_20s: number; age_30s: number;
  age_40s: number; age_50p: number; age_unknown: number;
  total: number;
};

export async function getProcedureReport(
  supabase: ServerClient,
  procedureKo: string,
): Promise<ProcedureReport | null> {
  const { data } = await supabase
    .from("procedure_reviews")
    .select(
      "satisfaction, pain, revisit, effect_areas, downtime, effect_onset, card:cards!inner(status, deleted_at)",
    )
    .eq("procedure_ko", procedureKo)
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<Row[]>();

  const rows = data ?? [];
  if (rows.length === 0) return null;

  // 시술 분류(category) 1회 조회 — 카드 테두리 색 분기용. anon SELECT 허용(0204).
  const { data: taxRow } = await supabase
    .from("procedure_taxonomy")
    .select("category")
    .eq("ko", procedureKo)
    .maybeSingle<{ category: string | null }>();
  const category: ProcedureCategory | null =
    taxRow?.category === "lifting" || taxRow?.category === "injectables"
      ? taxRow.category
      : null;

  const n = rows.length;
  const satisfactionDist = [0, 0, 0, 0, 0];
  const painDist = [0, 0, 0, 0, 0];
  let satSum = 0;
  let painSum = 0;
  const revisit = { yes: 0, maybe: 0, no: 0 };
  const effectCount = new Map<string, number>();

  // 다운타임·효과시기 분포 — 슬러그→인덱스(SSOT 순서). NULL=미답(분모 제외).
  const dtIndex = new Map(DOWNTIME_OPTIONS.map((o, i) => [o.value, i]));
  const onsetIndex = new Map(EFFECT_ONSET_OPTIONS.map((o, i) => [o.value, i]));
  const downtimeDist = [0, 0, 0, 0, 0];
  const onsetDist = [0, 0, 0, 0, 0];
  let noEffectCount = 0;

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
    // 효과 — '없음'은 일반 효과 목록에서 분리(noEffectCount 로만 집계).
    let rowHasNone = false;
    for (const e of r.effect_areas ?? []) {
      if (typeof e !== "string" || !e.trim()) continue;
      if (e === EFFECT_NONE_LABEL) {
        rowHasNone = true;
        continue;
      }
      effectCount.set(e, (effectCount.get(e) ?? 0) + 1);
    }
    if (rowHasNone) noEffectCount += 1;
    const di = r.downtime ? dtIndex.get(r.downtime) : undefined;
    if (di !== undefined) downtimeDist[di] += 1;
    const oi = r.effect_onset ? onsetIndex.get(r.effect_onset) : undefined;
    if (oi !== undefined) onsetDist[oi] += 1;
  }

  const downtimeAnswered = downtimeDist.reduce((a, b) => a + b, 0);
  const onsetAnswered = onsetDist.reduce((a, b) => a + b, 0);

  const effects = [...effectCount.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / n) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));

  // 작성자 인구통계 — 집계 RPC(개별 PII 비노출).
  const { data: demoData } = await supabase.rpc(
    "get_procedure_review_demographics",
    { p_procedure_ko: procedureKo },
  );
  const demoRow = (Array.isArray(demoData) ? demoData[0] : demoData) as
    | DemoRow
    | null
    | undefined;
  const ageRaw: { label: string; count: number }[] = demoRow
    ? [
        { label: "10대", count: demoRow.age_u20 ?? 0 },
        { label: "20대", count: demoRow.age_20s ?? 0 },
        { label: "30대", count: demoRow.age_30s ?? 0 },
        { label: "40대", count: demoRow.age_40s ?? 0 },
        { label: "50대+", count: demoRow.age_50p ?? 0 },
      ]
    : [];
  const demographics: Demographics = {
    male: demoRow?.male ?? 0,
    female: demoRow?.female ?? 0,
    total: demoRow?.total ?? 0,
    ageBands: ageRaw.filter((b) => b.count > 0),
  };

  return {
    procedureKo,
    category,
    count: n,
    avgSatisfaction: satSum / Math.max(1, satisfactionDist.reduce((a, b) => a + b, 0)),
    satisfactionDist,
    avgPain: painSum / Math.max(1, painDist.reduce((a, b) => a + b, 0)),
    painDist,
    revisit,
    effects,
    noEffectCount,
    downtimeAnswered,
    downtimeDist,
    onsetAnswered,
    onsetDist,
    demographics,
  };
}

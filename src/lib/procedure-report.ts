/**
 * 시술별 후기 리포트 집계 — /reports/[procedure] 전용.
 *
 * 별도 집계 카드를 저장하지 않고(중복·동기화 누더기 방지) procedure_reviews 를 실시간 집계.
 * 발행(published)·미삭제 후기만 대상. count===0 이면 null.
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
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
  /** procedure_taxonomy.en — 영문 슬러그(/reports/{en} 링크·canonical). 미발견 시 "". */
  en: string;
  /** 시술 리포트 앵커 카드(type=review_summary). 저장·공유 버튼용 card_id 출처.
   *  draft 라 RLS 우회(admin client)로 조회. 없으면(후기 0/미백필) null → 버튼 미노출. */
  anchor: CardData | null;
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
  // 작업 D — 롤업: 부모 시술이면 자기+직속하위 후기를 집계(자식은 자기만).
  //   procedure_family(ko) SQL 헬퍼(0225) 가 SSOT — demographics/pool RPC 와 동일.
  const { data: famData } = await supabase.rpc("procedure_family", {
    p_ko: procedureKo,
  });
  const family: string[] =
    Array.isArray(famData) && famData.length > 0
      ? (famData as string[])
      : [procedureKo];

  const { data } = await supabase
    .from("procedure_reviews")
    .select(
      "satisfaction, pain, revisit, effect_areas, downtime, effect_onset, card:cards!inner(status, deleted_at)",
    )
    .in("procedure_ko", family)
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<Row[]>();

  const rows = data ?? [];
  if (rows.length === 0) return null;

  // 시술 분류(category) 1회 조회 — 카드 테두리 색 분기용. SSOT=tag_dictionary(is_procedure).
  //   tag_dictionary.category 는 한글(리프팅/스킨부스터) → 기존 영문 slug 로 매핑(테마·schema 정합).
  const { data: taxRow } = await supabase
    .from("tag_dictionary")
    .select("category, en")
    .eq("ko", procedureKo)
    .eq("is_procedure", true)
    .maybeSingle<{ category: string | null; en: string | null }>();
  const category: ProcedureCategory | null =
    taxRow?.category === "리프팅"
      ? "lifting"
      : taxRow?.category === "스킨부스터"
        ? "injectables"
        : null;
  const en = taxRow?.en ?? "";

  // 시술 리포트 앵커(type=review_summary) 조회 — ★일반(공개 RLS) 경로 + published 한정.
  //   저장·공유 버튼의 대상 card_id. 앵커가 draft 인 동안은 published 필터·RLS 로 반환 0 →
  //   버튼 미노출(플립 전엔 카드 동일). published 플립(C6) 시 한 번에 노출. elevated/admin fetch 지양.
  const { data: anchorRow } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("type", "review_summary")
    .eq("status", "published")
    .is("deleted_at", null)
    .contains("keywords", [procedureKo])
    .limit(1)
    .maybeSingle();
  const anchor = (anchorRow as CardData | null) ?? null;

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
    en,
    anchor,
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

/**
 * 작업 D 롤업 — 시술 family(자기+직속하위) 의 발행 후기 카드 id 목록.
 *   집계(getProcedureReport)와 후기 목록(/reports·/api/reports/[procedure]/reviews)이
 *   같은 procedure_ko family 기준을 쓰도록(카드 keywords 기반 목록과의 불일치 제거).
 *   순서·페이징은 호출부가 cards.id IN (...) + created_at desc 로 처리.
 */
export async function getFamilyReviewCardIds(
  supabase: ServerClient,
  procedureKo: string,
): Promise<number[]> {
  const { data: famData } = await supabase.rpc("procedure_family", {
    p_ko: procedureKo,
  });
  const family: string[] =
    Array.isArray(famData) && famData.length > 0
      ? (famData as string[])
      : [procedureKo];

  const { data } = await supabase
    .from("procedure_reviews")
    .select("card_id, card:cards!inner(status, deleted_at)")
    .in("procedure_ko", family)
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<{ card_id: number }[]>();
  return (data ?? []).map((r) => r.card_id);
}

/**
 * /topics → /reports 얇은 링크용 — 해당 시술(ko)의 published 리포트 존재 + 후기 수(N).
 *   경량 단일 쿼리 `get_review_summary_pool`(0218, family 롤업 0228) 에서 ko===procedureKo 매칭.
 *   무거운 getProcedureReport 미사용. 존재(후기 ≥1)면 { count } 반환, 없으면 null.
 *   링크 URL 은 /reports/{ko}(=procedureKo) — pool 의 review_count 가 N(라벨용).
 */
export async function getReportSummaryForTag(
  supabase: ServerClient,
  procedureKo: string,
): Promise<{ count: number } | null> {
  const { data } = await supabase.rpc("get_review_summary_pool");
  const rows = (data ?? []) as PoolRow[];
  const row = rows.find((r) => r.ko === procedureKo && !!r.en);
  if (!row) return null;
  const count = Number(row.review_count) || 0;
  return count >= 1 ? { count } : null;
}

type PoolRow = {
  anchor_card_id: number;
  anchor_title: string | null;
  en: string | null;
  ko: string;
  category: string | null;
  like_count: number | null;
  save_count: number | null;
  share_count: number | null;
  review_count: number;
  sat_avg: number | null;
  sat_dist: number[] | null;
  pain_avg: number | null;
  revisit_yes: number;
  revisit_maybe: number;
  revisit_no: number;
};

/**
/** 피드에 리포트 카드를 띄울 최소 후기 수. 미만 시술은 피드 미노출(단, /reports/{en} 단독
 *  페이지·검색 결과 상단 리포트 카드는 getProcedureReport 경로라 후기 1건부터 그대로 노출). */
const FEED_MIN_REVIEWS = 4;

/**
 * 홈 피드 결정적 주입용 시술 리포트 풀 — `get_review_summary_pool` RPC(단일 쿼리, 마이그 0218)
 * 결과를 컴팩트 ProcedureReportCard 가 쓰는 ProcedureReport 형태로 매핑.
 *
 * 컴팩트(접힘) 카드는 헤더·재시술·만족도(분포)·통증만 표시 → 효과·인구통계·다운타임/효과시기
 * 분포는 미사용이라 빈 기본값으로 채운다(더보기는 인라인 펼침이 아니라 /reports/{en} 링크).
 * published 앵커만 반환(draft 면 빈 배열) → 공개 플립 전엔 피드에 리포트 카드 미주입.
 * 후기 < FEED_MIN_REVIEWS 시술은 피드에서 제외(표본 적은 리포트 도배 방지). 단독 URL·검색은 무관.
 */
export async function getReviewSummaryFeedPool(
  supabase: ServerClient,
): Promise<ProcedureReport[]> {
  const { data } = await supabase.rpc("get_review_summary_pool");
  const rows = (data ?? []) as PoolRow[];
  // 시술이 피드에서 골고루 섞이도록 서버에서 1회 셔플(요청마다 순서 변동).
  //   서버에서 한 번만 섞고 그 결과를 prop 으로 내려보냄 → SSR/클라이언트 하이드레이션 일관
  //   (Math.random 을 렌더 중 호출하지 않음). Feed 는 윈도 순번대로 이 배열을 순회.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows
    .filter((r) => !!r.en && Number(r.review_count) >= FEED_MIN_REVIEWS)
    .map((r) => {
      const en = r.en as string;
      const category: ProcedureCategory | null =
        r.category === "lifting" || r.category === "injectables"
          ? r.category
          : null;
      const anchor: CardData = {
        id: r.anchor_card_id,
        title: r.anchor_title ?? `${r.ko} 시술 리포트`,
        body: "",
        meta: null,
        keywords: [r.ko, en],
        like_count: r.like_count ?? 0,
        view_count: 0,
        save_count: r.save_count ?? 0,
        share_count: r.share_count ?? 0,
        type: "review_summary",
        post_slug: en,
        doctor: null,
        video: null,
      };
      return {
        procedureKo: r.ko,
        en,
        anchor,
        category,
        count: Number(r.review_count) || 0,
        avgSatisfaction: Number(r.sat_avg) || 0,
        satisfactionDist: (r.sat_dist ?? [0, 0, 0, 0, 0]).map((x) => Number(x) || 0),
        avgPain: Number(r.pain_avg) || 0,
        painDist: [0, 0, 0, 0, 0],
        revisit: {
          yes: Number(r.revisit_yes) || 0,
          maybe: Number(r.revisit_maybe) || 0,
          no: Number(r.revisit_no) || 0,
        },
        effects: [],
        noEffectCount: 0,
        downtimeAnswered: 0,
        downtimeDist: [0, 0, 0, 0, 0],
        onsetAnswered: 0,
        onsetDist: [0, 0, 0, 0, 0],
        demographics: { male: 0, female: 0, total: 0, ageBands: [] },
      } satisfies ProcedureReport;
    });
}

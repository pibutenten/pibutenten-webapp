/**
 * 시술별 후기 리포트 집계 — /reports/[procedure] 전용.
 *
 * 별도 집계 카드를 저장하지 않고(중복·동기화 누더기 방지) procedure_reviews 를 실시간 집계.
 * 발행(published)·미삭제 후기만 대상. count===0 이면 null.
 */
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import {
  DOWNTIME_OPTIONS,
  EFFECT_ONSET_OPTIONS,
  EFFECT_NONE_LABEL,
} from "@/lib/review-options";
import { PROCEDURE_SLUGS, type ProcedureSlug } from "@/lib/categories";

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

export type ProcedureCategory = ProcedureSlug;

/**
 * tag_dictionary.category(한글) → 테마 영문 slug 매핑 — SSOT.
 *   getProcedureReport(카드 테두리 색)·reports/[procedure] page(비슷한 시술 카드 색)가 공용.
 *   미분류·미발견은 null. ⚠ 입력은 **한글** 전용 — pool RPC(get_review_summary_pool)처럼
 *   이미 영문 slug 를 반환하는 소스에 쓰면 항상 null (getReportSummaryForTag 과거 결함).
 */
export function categoryKoToSlug(
  ko: string | null | undefined,
): ProcedureCategory | null {
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
 * procedure_family(ko) RPC — 부모 시술이면 자기+직속하위, 자식이면 자기만(0225 SSOT).
 *   React cache() 요청 단위 dedup — 한 요청 안에서 getProcedureReport 와
 *   getFamilyReviewCardIds 가 각각 호출해도 RPC 는 1회(리포트 상세 성능).
 *   supabase 클라는 내부 생성(인자로 받으면 호출부마다 참조가 달라 캐시 미스).
 *   ⚠ 호출부(getProcedureReport 등)가 받는 supabase 인자는 이 캐시와 무관 —
 *     여기에 인자 클라를 주입하면 캐시 키가 깨지므로 시그니처를 (ko) 로 유지할 것.
 */
const procedureFamilyCached = cache(
  async (procedureKo: string): Promise<string[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("procedure_family", {
      p_ko: procedureKo,
    });
    return Array.isArray(data) && data.length > 0
      ? (data as string[])
      : [procedureKo];
  },
);

export type ProcedureReport = {
  procedureKo: string;
  /** tag_dictionary(is_procedure=true).en — 영문 슬러그(/reports/{en} 링크·canonical). 미발견 시 "". */
  en: string;
  /** 시술 리포트 앵커 카드(type=review_summary). 저장·공유 버튼용 card_id 출처.
   *  draft 라 RLS 우회(admin client)로 조회. 없으면(후기 0/미백필) null → 버튼 미노출. */
  anchor: CardData | null;
  /** tag_dictionary(is_procedure=true).category — 카드 테두리 색 분기용. 미발견 시 null. */
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
  //   요청 단위 cache(procedureFamilyCached) — getFamilyReviewCardIds 와 RPC 공유.
  const family = await procedureFamilyCached(procedureKo);

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

  // 서로 독립인 3개 조회(분류·앵커·인구통계)를 병렬 실행 — 리포트 상세 임계경로 단축.
  //   rows 조회·0건 조기 return 은 위에서 이미 끝났으므로 여기부터는 전부 필요 데이터.
  //   1) 시술 분류(category) — 카드 테두리 색 분기용. SSOT=tag_dictionary(is_procedure).
  //      tag_dictionary.category 는 한글(리프팅/스킨부스터) → categoryKoToSlug 로 영문 slug 매핑.
  //   2) 시술 리포트 앵커(type=review_summary) — ★일반(공개 RLS) 경로 + published 한정.
  //      저장·공유 버튼의 대상 card_id. 앵커가 draft 인 동안은 published 필터·RLS 로 반환 0 →
  //      버튼 미노출(플립 전엔 카드 동일). published 플립(C6) 시 한 번에 노출. elevated/admin fetch 지양.
  //   3) 작성자 인구통계 — 집계 RPC(개별 PII 비노출).
  const [{ data: taxRow }, { data: anchorRow }, { data: demoData }] =
    await Promise.all([
      supabase
        .from("tag_dictionary")
        .select("category, en")
        .eq("ko", procedureKo)
        .eq("is_procedure", true)
        .maybeSingle<{ category: string | null; en: string | null }>(),
      supabase
        .from("cards")
        .select(CARD_LIST_SELECT)
        .eq("type", "review_summary")
        .eq("status", "published")
        .is("deleted_at", null)
        .contains("keywords", [procedureKo])
        .limit(1)
        .maybeSingle(),
      supabase.rpc("get_procedure_review_demographics", {
        p_procedure_ko: procedureKo,
      }),
    ]);
  const category = categoryKoToSlug(taxRow?.category);
  const en = taxRow?.en ?? "";
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

  // 작성자 인구통계 — 위 Promise.all 의 demoData 를 매핑.
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
  // 요청 단위 cache — 같은 요청의 getProcedureReport 와 procedure_family RPC 1회 공유.
  const family = await procedureFamilyCached(procedureKo);

  const { data } = await supabase
    .from("procedure_reviews")
    .select("card_id, card:cards!inner(status, deleted_at)")
    .in("procedure_ko", family)
    .eq("card.status", "published")
    .is("card.deleted_at", null)
    .returns<{ card_id: number }[]>();
  return (data ?? []).map((r) => r.card_id);
}

/** /topics 닫힌 리포트 글상자(ReportSummaryBox)용 요약 — pool 1행의 핵심 지표만. */
export type ReportTagSummary = {
  count: number;
  /** 만족도 평균(1~5). pool 미집계면 null. */
  satAvg: number | null;
  /** 통증 평균(1~5). pool 미집계면 null. */
  painAvg: number | null;
  revisit: { yes: number; maybe: number; no: number };
  category: ProcedureCategory | null;
};

/**
 * /topics → /reports 닫힌 리포트 글상자용 — 해당 시술(ko)의 published 리포트 존재 + 요약 지표.
 *   경량 단일 쿼리 `get_review_summary_pool`(0218, family 롤업 0228) 에서 ko===procedureKo 매칭.
 *   무거운 getProcedureReport 미사용. 존재(후기 ≥1)면 ReportTagSummary 반환, 없으면 null.
 *   링크 URL 은 /reports/{ko}(=procedureKo) — pool 의 review_count 가 N(라벨용).
 */
export async function getReportSummaryForTag(
  supabase: ServerClient,
  procedureKo: string,
): Promise<ReportTagSummary | null> {
  const { data } = await supabase.rpc("get_review_summary_pool");
  const rows = (data ?? []) as PoolRow[];
  const row = rows.find((r) => r.ko === procedureKo && !!r.en);
  if (!row) return null;
  const count = Number(row.review_count) || 0;
  if (count < 1) return null;
  return {
    count,
    satAvg: row.sat_avg == null ? null : Number(row.sat_avg),
    painAvg: row.pain_avg == null ? null : Number(row.pain_avg),
    revisit: {
      yes: Number(row.revisit_yes) || 0,
      maybe: Number(row.revisit_maybe) || 0,
      no: Number(row.revisit_no) || 0,
    },
    // pool RPC 의 category 는 이미 영문 slug — getReviewSummaryFeedPool 과 동일하게
    //   유효 slug 검증 후 그대로 사용 (한글 매퍼 categoryKoToSlug 통과 금지 — 항상 null 이 됨).
    category: (PROCEDURE_SLUGS as readonly string[]).includes(row.category as string)
      ? (row.category as ProcedureCategory)
      : null,
  };
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

/** 리포트 집계 풀에 노출할 최소 후기 수. 미만 시술은 풀(=/reports 허브)에서 제외(표본 적은
 *  리포트 도배 방지). 단, /reports/{ko} 단독 페이지·검색 결과 상단 리포트 카드는 getProcedureReport
 *  경로라 후기 1건부터 그대로 노출(허브와 의도된 게이트 비대칭 — 단, 미만 상세는 noindex).
 *  export — reports/[procedure] generateMetadata 의 SEO 게이트(저표본 noindex)가 같은 임계 공유. */
export const FEED_MIN_REVIEWS = 4;

/**
 * 시술 리포트 집계 풀 — `get_review_summary_pool` RPC(단일 쿼리, 마이그 0218) 결과를 컴팩트
 * ProcedureReportCard 가 쓰는 ProcedureReport 형태로 매핑.
 *
 * 소비처(현재): `/reports` 허브(`app/reports/page.tsx`) — 자격 시술 목록을 count desc 로 재정렬해 노출.
 *   (구 홈 피드 20장당 1장 주입은 2026-06-28 피드 정리로 제거됨 → 이 함수는 더 이상 홈 피드가 소비 안 함.)
 * 컴팩트(접힘) 카드는 헤더·재시술·만족도(분포)·통증만 표시 → 효과·인구통계·다운타임/효과시기
 * 분포는 미사용이라 빈 기본값으로 채운다(상세는 /reports/{ko} 링크).
 * published 앵커만 반환(draft 면 빈 배열) → 공개 플립 전엔 허브에 리포트 미노출.
 * 후기 < FEED_MIN_REVIEWS 시술은 제외. 단독 URL·검색 블렌딩은 무관.
 */
export async function getReviewSummaryFeedPool(
  supabase: ServerClient,
): Promise<ProcedureReport[]> {
  const { data } = await supabase.rpc("get_review_summary_pool");
  const rows = (data ?? []) as PoolRow[];
  // 서버에서 1회 셔플 — SSR/클라 하이드레이션 일관(Math.random 을 렌더 중 호출하지 않음). 현 유일 소비처
  //   (/reports 허브)는 count desc 로 재정렬하므로 셔플은 사실상 무력. 향후 홈 피드 재주입(무작위 순번)
  //   대비로 보존하며, 재주입 계획이 폐기되면 이 셔플 블록을 제거한다.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows
    .filter((r) => !!r.en && Number(r.review_count) >= FEED_MIN_REVIEWS)
    .map((r) => {
      const en = r.en as string;
      const category: ProcedureCategory | null =
        (PROCEDURE_SLUGS as readonly string[]).includes(r.category as string)
          ? (r.category as ProcedureCategory)
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

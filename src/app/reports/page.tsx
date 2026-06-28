import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ProcedureReport } from "@/lib/procedure-report";
import { EFFECT_NONE_LABEL, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { buildHeadlinePool, pickHeadline, toSignals } from "@/lib/report-headline";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import { getReportsPoolCached } from "./reports-pool";
import ReportsIndexView from "./ReportsIndexView";

/**
 * /reports — 시술 리포트 허브 (인덱스, 서버 컴포넌트).
 *
 * 내비(탭/GNB)의 '리포트' 슬롯 진입점. 개별 시술 리포트는 /reports/{ko}(동적 라우트, 공존).
 *
 * SEO(옛 허브 100% 보존): generateMetadata(title absolute · desc 라이브 수치 · canonical ·
 *   robots 자격 0건 noindex/그 외 index · OG/twitter) + JSON-LD CollectionPage + ItemList
 *   (mainEntity itemListElement = 시술별 /reports/{encodeURIComponent(ko)}). 자격 0건이면 JSON-LD 미렌더.
 *
 * 데이터(개선판 배선 계승): getReviewSummaryFeedPool(N≥4 게이트 + family 롤업) → count desc 정렬.
 *   1) 시술별 회전 헤드라인(report-headline)을 서버에서 확정해 prop(요청마다 랜덤).
 *   2) 대표 효과(top3 + 비율) + 효과 발현 최다 시점을 서버 선집계해 prop(카드 펼침 즉시 표시).
 *   robots/JSON-LD 의 "자격 시술 목록·카운트"는 모두 이 pool 에서 도출.
 *
 * 헤드라인이 매 요청 랜덤이라 force-dynamic(개별 리포트 [procedure]와 정합 — 둘 다 force-dynamic).
 *   robots 는 인덱싱 허용이므로 force-dynamic 이어도 색인 가능.
 */
export const dynamic = "force-dynamic";

type TopEffect = { label: string; pct: number };
/** 카드 펼침용 서버 선집계 — 대표 효과 top3 + 효과 발현 최다 시점 라벨. */
type Extras = { effects: TopEffect[]; onsetLabel: string | null };

/** count desc 정렬된 자격 시술 목록(N≥4). 동률은 시술명 ko 사전순으로 안정 정렬. */
async function loadPool(): Promise<ProcedureReport[]> {
  const pool = await getReportsPoolCached();
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
  const reports = await loadPool();
  const url = `${SITE_URL}/reports`;

  // 자격 시술 0건 → noindex(빈 허브 색인 회피). [procedure] 의 빈 리포트 noindex 와 동일 정책.
  if (reports.length === 0) {
    return {
      title: { absolute: "시술 리포트 | 피부텐텐" },
      description: "실제 경험자 데이터로 정리한 피부 시술 리포트를 준비하고 있어요.",
      alternates: { canonical: url },
      robots: { index: false, follow: true },
    };
  }

  // title: 주제 first · 브랜드 last(PRD §5.4). 홈처럼 absolute(루트 "%s | 피부텐텐" 템플릿 중복 방지 불필요 —
  //   여기 title 이 이미 브랜드 포함). 수치는 라이브 집계.
  const title = "시술 리포트 | 피부텐텐";
  const totalExperiences = reports.reduce((sum, r) => sum + r.count, 0);
  // desc: 라이브 수치(시술 수 · 총 후기 수). 최상급·효과단정·후기보증 금지. title 과 비중복(title=주제, desc=데이터).
  //   report-copy SSOT: 본문 서술형은 '경험'이나 SEO 메타(/reports desc·OG)·RSS 는 검색 의도상 '후기' 유지.
  const desc = `${reports.length}개 시술, 총 ${totalExperiences}건의 후기를 만족도·재시술 의향·통증으로 정리했어요.`;
  return {
    title: { absolute: title },
    description: desc,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    ...buildSocialMeta({
      title,
      description: desc,
      canonical: url,
      ogImage: buildOgImage(null),
      ogType: "website",
    }),
  };
}

export default async function ReportsHubPage() {
  const supabase = await createSupabaseServerClient();
  const pool = await loadPool();
  const extras = await loadExtras(supabase, pool);

  // 시술별 — 대표효과 주입 → 시그널 → 풀 → 서버 랜덤픽 1개(요청마다). 효과·시점도 함께 prop.
  const items = pool.map((report) => {
    const ex = extras.get(report.procedureKo) ?? { effects: [], onsetLabel: null };
    const signals = toSignals(report, ex.effects[0] ?? null, ex.effects[1] ?? null);
    const headline = pickHeadline(buildHeadlinePool(signals));
    return { report, headline, effects: ex.effects, onsetLabel: ex.onsetLabel };
  });

  // JSON-LD — CollectionPage + ItemList(각 item 이 /reports/{ko}). 최소·정확.
  //   provider/publisher 는 layout 의 #organization(SSOT) 참조만(노드 재정의 금지). 자격 0건이면 생략.
  const url = `${SITE_URL}/reports`;
  const jsonLd =
    pool.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${url}#webpage`,
          name: "시술 리포트",
          url,
          inLanguage: "ko-KR",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          publisher: { "@id": `${SITE_URL}/#organization` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: pool.length,
            itemListElement: pool.map((r, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: r.procedureKo,
              url: `${SITE_URL}/reports/${encodeURIComponent(r.procedureKo)}`,
            })),
          },
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
        />
      )}
      <ReportsIndexView items={items} />
    </>
  );
}

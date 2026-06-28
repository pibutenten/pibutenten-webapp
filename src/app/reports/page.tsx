import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewSummaryFeedPool, type ProcedureReport } from "@/lib/procedure-report";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import ReportsHubView from "./ReportsHubView";

/**
 * /reports — 시술 리포트 허브 (인덱스, 서버 컴포넌트).
 *
 * 내비(탭/GNB)의 '리포트' 슬롯 진입점. 개별 시술 리포트는 /reports/{ko}(동적 라우트, 공존).
 * 데이터: getReviewSummaryFeedPool — 이미 N≥4(FEED_MIN_REVIEWS) 게이트 + family 롤업 + 셔플.
 *   여기선 count desc 로 재정렬(데이터 많은 시술 먼저). 컴팩트 ProcedureReport[] 라
 *   count/avgSatisfaction/revisit/category 만 표시(effects/onset 등은 빈값이라 미사용).
 * 표본 게이트: pool 이 N≥4 만 주므로 빈 깡통 자동 차단. N=1~3 시술은 여기 미도달
 *   (단독 /reports/{ko} 페이지 전용 — getProcedureReport 경로는 후기 1건부터 노출).
 *
 * 라이브 수치라 force-dynamic(개별 리포트 [procedure]와 정합 — 둘 다 force-dynamic).
 */
export const dynamic = "force-dynamic";

/** count desc 정렬된 자격 시술 목록(N≥4). 동률은 시술명 ko 사전순으로 안정 정렬. */
async function loadHubReports(): Promise<ProcedureReport[]> {
  const supabase = await createSupabaseServerClient();
  const pool = await getReviewSummaryFeedPool(supabase);
  return [...pool].sort(
    (a, b) => b.count - a.count || a.procedureKo.localeCompare(b.procedureKo, "ko"),
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const reports = await loadHubReports();
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
  const reports = await loadHubReports();

  // JSON-LD — CollectionPage + ItemList(각 item 이 /reports/{ko}). 최소·정확.
  //   provider/publisher 는 layout 의 #organization(SSOT) 참조만(노드 재정의 금지). 자격 0건이면 생략.
  const url = `${SITE_URL}/reports`;
  const jsonLd =
    reports.length > 0
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
            numberOfItems: reports.length,
            itemListElement: reports.map((r, i) => ({
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
      <ReportsHubView reports={reports} />
    </>
  );
}

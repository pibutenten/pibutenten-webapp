"use client";

/**
 * ReportsHubView — /reports 리포트 허브 본문 (클라이언트).
 *
 * 원칙(ProcedureReportView 선례와 동일): "상단바(헤더)만 앱 셸, 본문은 기능적 목록".
 *   - 데이터·generateMetadata·JSON-LD 는 server page(page.tsx)가 책임. 여기선 표시만.
 *   - 셸은 active="리포트"(리포트 탭 강조), back="/"(피드 fallback), 검색은 운영 홈(/?q=)으로 라우팅.
 *   - 각 시술 행 → /reports/{ko}(한글 canonical) 진입. 카테고리색은 categoryTheme(SSOT).
 *   - 새 하드코딩 색·새 문자열 금지: globals 토큰 + categoryTheme + report-copy 재사용.
 *
 * 표본 게이트: pool 은 이미 N≥4(FEED_MIN_REVIEWS)만 반환 → 빈 깡통 자동 차단.
 *   N=1~3 시술은 허브 미도달(단독 /reports/{ko} 페이지 전용). N=4~9 는 '데이터 쌓이는 중' 미세 표기.
 */

import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { experienceCount } from "@/lib/report-copy";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";

export default function ReportsHubView({
  reports,
}: {
  /** count desc 정렬된 시술 리포트 목록 (server 에서 N≥4 게이트 + 정렬 완료). */
  reports: ProcedureReport[];
}) {
  const search = useSearchRouting();

  return (
    <AppShell
      active="리포트"
      back="/"
      backTitle={
        <h1>
          시술 리포트 <b>{reports.length}</b>개
        </h1>
      }
      {...search}
    >
      {reports.length === 0 ? (
        <p className="px-1 py-8 text-center text-[14px] leading-[1.6] text-[var(--text-muted)]">
          아직 집계된 시술 리포트가 없어요.
          <br />
          후기가 쌓이면 시술별 리포트를 보여드릴게요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => {
            const theme = categoryTheme(r.category);
            const rTotal = r.revisit.yes + r.revisit.maybe + r.revisit.no;
            const revisitPct =
              rTotal > 0 ? Math.round((r.revisit.yes / rTotal) * 100) : null;
            return (
              <li key={r.procedureKo}>
                <Link
                  href={`/reports/${encodeURIComponent(r.procedureKo)}`}
                  className="flex items-stretch gap-3 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--primary)]"
                >
                  {/* 카테고리색 좌측 바 — categoryTheme(SSOT). 미분류면 var(--primary). */}
                  <span
                    aria-hidden
                    className="w-1 shrink-0 self-stretch"
                    style={{ background: theme.color }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-3">
                    <span className="flex items-baseline gap-2">
                      <b
                        title={r.procedureKo}
                        className="truncate text-[15px] font-semibold text-[var(--text)]"
                      >
                        {r.procedureKo}
                      </b>
                      <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                        {experienceCount(r.count)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] text-[var(--text-secondary)]">
                      <span>
                        만족도{" "}
                        <b className="font-semibold text-[var(--text)]">
                          {r.avgSatisfaction.toFixed(1)}
                        </b>
                        /5
                      </span>
                      {revisitPct !== null && (
                        <>
                          <span aria-hidden className="text-[var(--text-muted)]">
                            ·
                          </span>
                          <span>
                            재시술 의향{" "}
                            <b className="font-semibold text-[var(--text)]">
                              {revisitPct}%
                            </b>
                          </span>
                        </>
                      )}
                      {/* N=4~9: 표본 적음 미세 표기(ReportSampleNotice 톤). N≥10 은 생략. */}
                      {r.count < 10 && (
                        <span
                          className="shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]"
                          style={{ background: theme.soft }}
                        >
                          데이터 쌓이는 중
                        </span>
                      )}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="flex shrink-0 items-center pr-3 text-[var(--text-muted)]"
                  >
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

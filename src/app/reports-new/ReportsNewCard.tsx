"use client";

/**
 * ReportsNewCard — /reports-new(시술 리포트 인덱스 개선판) 전용 에디토리얼 요약 카드.
 *
 * 공용 ProcedureReportCard 와 무관한 **자체 독립 구현**(병렬 세션이 공용 카드를 작업 중이라
 * import·의존 없이 격리). 컴팩트 풀(getReviewSummaryFeedPool)이 채우는 값만 사용한다:
 *   count / avgSatisfaction / satisfactionDist / avgPain / revisit{yes,maybe,no} / category.
 *   effects / downtime / onset / demographics 는 컴팩트 풀에서 비어 있어 사용하지 않는다.
 *
 * 한 시술 = 한 장. 헤더(시술명 h2 + 경험 수) → 회전 헤드라인 한 줄 → 재시술 의향 →
 *   만족도(별점+분포) → 통증 게이지(있을 때만) → 전체 리포트 링크.
 *
 * 접근성:
 *   - 페이지 h1 은 AppShell backTitle 에 있으므로 카드 제목은 <h2>(중복 방지).
 *   - 분할 막대·게이지는 aria-hidden(시각 보조) + 텍스트 범례로 같은 정보를 제공.
 *   - 흰 글씨는 #1B87C9(var(--primary-active)) 이상 진한 배경에서만(AA). 막대 안 텍스트 금지.
 *   - 키보드 포커스 링은 globals.css :focus-visible 정책에 맞춰 focus-visible 유틸로 가시화.
 *
 * 격리: app.module.css 클래스 의존 금지 — Tailwind 유틸 + globals.css 토큰(var(--…)) + categoryTheme.
 */

import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { experienceCount } from "@/lib/report-copy";

// 재시술 의향 색 — 흰 글씨 없이 색 세그먼트만 쓰므로 막대엔 대비 부담이 없으나,
//   yes 는 헤로 숫자(흰 배경 위 다크 텍스트) 외 칩 등 다른 곳과 톤을 맞추려 AA 진파랑 사용.
const REVISIT_COLORS = {
  yes: "var(--primary-active)", // #1B87C9
  maybe: "#8a929e",
  no: "#d9534f",
} as const;

// 통증 게이지 그라데이션 — 없음(파랑)→심함(빨강). ProcedureReportCard 와 동일 팔레트(시각 일관).
const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#7FD0F8", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
// 통증 위치 매핑 — 없음=6.25% … 심함=93.75%(라벨/마커 안쪽 정렬).
const PAIN_INSET_LEFT = 6.25;
const PAIN_INSET_SPAN = 87.5;
function painPos(value1to5: number): number {
  const v = Math.min(5, Math.max(1, value1to5));
  return PAIN_INSET_LEFT + ((v - 1) / 4) * PAIN_INSET_SPAN;
}

// 포커스 링 — globals.css 가 :focus-visible 만 살려두므로 키보드 포커스에서만 보임.
const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

export default function ReportsNewCard({
  report,
  headline,
}: {
  report: ProcedureReport;
  /** 서버에서 확정한 회전 헤드라인 1줄(report-headline 엔진). SSR/CSR 일치 위해 그대로 표시. */
  headline: string;
}) {
  const {
    procedureKo,
    category,
    count,
    avgSatisfaction,
    satisfactionDist,
    avgPain,
    revisit,
  } = report;

  const theme = categoryTheme(category);

  // 재시술 의향 — 분할 막대 비율(반올림 후 no 는 잔여로 보정해 합 100%).
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);

  // 만족도 — 별점 채움(반올림) + 분포 미니바(5점→1점, 골드).
  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);

  // 통증 — 평균 0(미응답)이면 게이지 섹션 생략(컴팩트 풀은 painDist 가 비어 avgPain 만 신뢰).
  const hasPain = avgPain > 0;
  const painLeft = painPos(avgPain);
  // 라벨 위치(없음 6.25% … 심함 93.75%)에 맞춰 끝색을 평평하게 정렬한 그라데이션.
  const painGradient = `linear-gradient(90deg, ${PAIN_SOFT[0]} 0%, ${PAIN_SOFT.map(
    (c, i) => `${c} ${painPos(i + 1)}%`,
  ).join(", ")}, ${PAIN_SOFT[PAIN_SOFT.length - 1]} 100%)`;

  const reportHref = `/reports/${encodeURIComponent(procedureKo)}`;

  return (
    <article
      className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]"
      aria-label={`${procedureKo} 시술 리포트`}
    >
      {/* 헤더 — kicker + 시술명(h2) + 경험 수. 분류색 틴트 배경. */}
      <header
        className="px-5 pt-4 pb-3.5"
        style={{ backgroundColor: theme.soft }}
      >
        <div className="mb-1 text-[12px] font-bold tracking-tight text-[var(--text-secondary)]">
          피부텐텐 리포트
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-[22px] font-extrabold leading-tight tracking-[-0.02em]"
            style={{ color: theme.color }}
          >
            {procedureKo}
          </h2>
          <span className="shrink-0 text-[12.5px] text-[var(--text-secondary)]">
            {experienceCount(count)}
          </span>
        </div>
        {/* 회전 헤드라인 — 헤더 바로 아래, 눈에 띄는 한 줄. */}
        {headline && (
          <p className="mt-2 text-[14px] leading-[1.45] text-[var(--text-secondary)]">
            {headline}
          </p>
        )}
      </header>

      <div className="px-5 py-4">
        {/* 재시술 의향 */}
        <section aria-label="재시술 의향">
          <div className="mb-2.5 flex items-baseline gap-1.5">
            <span
              className="text-[22px] font-extrabold leading-none"
              style={{ color: theme.color }}
            >
              {yesPct}%
            </span>
            <span className="text-[13px] text-[var(--text-secondary)]">
              가 다시 받고 싶어 해요
            </span>
          </div>
          {/* 분할 막대 — 색 세그먼트만(막대 안 텍스트 없음). 정보는 아래 범례로. */}
          <div
            className="flex h-[14px] overflow-hidden rounded-full"
            aria-hidden
          >
            {yesPct > 0 && (
              <div
                style={{ width: `${yesPct}%`, backgroundColor: REVISIT_COLORS.yes }}
              />
            )}
            {maybePct > 0 && (
              <div
                style={{ width: `${maybePct}%`, backgroundColor: REVISIT_COLORS.maybe }}
              />
            )}
            {noPct > 0 && (
              <div
                style={{ width: `${noPct}%`, backgroundColor: REVISIT_COLORS.no }}
              />
            )}
          </div>
          {/* 범례 — 점 + 다크 라벨(--text-secondary). 분할 막대의 단일 출처. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-[var(--text-secondary)]">
            <span>
              <i
                className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle"
                style={{ backgroundColor: REVISIT_COLORS.yes }}
                aria-hidden
              />
              다시 받고 싶어요 {revisit.yes}명
            </span>
            {revisit.maybe > 0 && (
              <span>
                <i
                  className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle"
                  style={{ backgroundColor: REVISIT_COLORS.maybe }}
                  aria-hidden
                />
                고민 중 {revisit.maybe}명
              </span>
            )}
            <span>
              <i
                className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle"
                style={{ backgroundColor: REVISIT_COLORS.no }}
                aria-hidden
              />
              아니요 {revisit.no}명
            </span>
          </div>
        </section>

        {/* 만족도 */}
        <section aria-label="만족도" className="mt-5">
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <span
                className="text-[15px] leading-none tracking-[1px]"
                aria-hidden
              >
                {[1, 2, 3, 4, 5].map((nn) => (
                  <span
                    key={nn}
                    style={{
                      color: nn <= satRounded ? "var(--accent-save)" : "#DDE2E7",
                    }}
                  >
                    ★
                  </span>
                ))}
              </span>
              <span className="text-[20px] font-extrabold leading-none text-[var(--text)]">
                {avgSatisfaction.toFixed(1)}
              </span>
            </div>
            {/* 분포 미니바 — 5점→1점, 골드. 텍스트 라벨로 점수·인원 제공. */}
            <ul className="flex flex-1 flex-col gap-1">
              {[5, 4, 3, 2, 1].map((score) => {
                const c = satisfactionDist[score - 1] ?? 0;
                const w = Math.round((c / maxSat) * 100);
                return (
                  <li key={score} className="flex items-center gap-2">
                    <span className="w-3 shrink-0 text-[11px] font-semibold text-[var(--text-secondary)]">
                      {score}
                    </span>
                    <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${w}%`,
                          backgroundColor: "var(--accent-save)",
                        }}
                        aria-hidden
                      />
                    </span>
                    <span className="w-7 shrink-0 text-right text-[11px] text-[var(--text-muted)]">
                      {c}명
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="sr-only">
            만족도 평균 {avgSatisfaction.toFixed(1)}점 (5점 만점)
          </p>
        </section>

        {/* 통증 — avgPain 0(미응답)이면 섹션 생략. */}
        {hasPain && (
          <section aria-label="통증" className="mt-5">
            <div className="mb-2 text-[13px] font-semibold text-[var(--text)]">
              통증 평균{" "}
              <span className="text-[var(--text-secondary)]">
                {avgPain.toFixed(1)}점
              </span>
            </div>
            <div
              className="relative h-2 rounded-full"
              style={{ background: painGradient }}
              aria-hidden
            >
              <span
                className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]"
                style={{ left: `calc(${painLeft}% - 1.5px)` }}
              />
            </div>
            <div
              className="relative mt-1.5 h-[12px] text-[9.5px] text-[var(--text-muted)]"
              aria-hidden
            >
              {PAIN_LABELS.map((l, i) => (
                <span
                  key={l}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${painPos(i + 1)}%` }}
                >
                  {l}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 하단 — 전체 리포트 링크. */}
      <div className="border-t border-[var(--border)] px-5 py-3">
        <Link
          href={reportHref}
          className={
            "inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[13px] font-semibold text-[var(--primary-active)] transition-colors hover:text-[var(--primary-dark)] " +
            FOCUS_RING
          }
          aria-label={`${procedureKo} 전체 리포트 보기`}
        >
          전체 리포트 보기
          <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

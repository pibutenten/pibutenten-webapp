"use client";

/**
 * ReportSummaryBox — 시술 리포트 ①요약(접힘) 시각부 SSOT.
 *
 * ReportsIndexCard(/reports 인덱스 카드)의 접힘 헤더를 그대로 추출한 것:
 *   카테고리 틴트 헤더 + 시술명 + 재시술% 히어로 + 통증·만족도 미니 + 헤드라인 1줄.
 *
 * 소비처:
 *   - app/reports/ReportsIndexCard.tsx — 접힘부(토글·펼침은 카드가 소유).
 *   - app/topics/[tag]/TopicTagView.tsx — /reports/{ko} 로 가는 Link 로 감싼 닫힌 글상자.
 * 버튼/링크 래퍼는 포함하지 않음 — 소비처가 감싼다(카드=토글 헤더, 토픽=Link).
 *
 * flat — 음영/테두리 없음(우리 UI/UX). app.module.css 미사용 — Tailwind + globals.css
 * 토큰 + categoryTheme(인라인). 막대/게이지는 aria-hidden + 텍스트 병기.
 */

import type { ProcedureCategory } from "@/lib/procedure-report";
import { categoryTheme } from "@/lib/procedure-theme";
import { CATEGORIES } from "@/lib/categories";
import { experienceCount } from "@/lib/report-copy";

export default function ReportSummaryBox({
  procedureKo,
  category,
  count,
  avgSatisfaction,
  avgPain,
  revisit,
  headline,
}: {
  procedureKo: string;
  category: ProcedureCategory | null;
  /** 발행 후기 수(경험 N건 라벨). */
  count: number;
  avgSatisfaction: number;
  /** 0 이면 '응답 적음' 표시(하단 미니). */
  avgPain: number;
  revisit: { yes: number; maybe: number; no: number };
  /** 서버 확정 회전 헤드라인 1줄(SSR/CSR 일치). 빈 문자열이면 미표시. */
  headline: string;
}) {
  const theme = categoryTheme(category);
  const catLabel = CATEGORIES.find((c) => c.slug === category)?.label ?? null;

  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const hasPain = avgPain > 0;

  return (
    <div className="px-5 pt-4 pb-3.5" style={{ backgroundColor: theme.soft }}>
      <div className="mb-2 flex items-center gap-2 pr-10">
        <h2
          className="text-[17px] font-extrabold tracking-[-0.02em]"
          style={{ color: theme.color }}
        >
          {procedureKo}
        </h2>
        {catLabel && (
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
            style={{ color: "#fff", backgroundColor: theme.color }}
          >
            {catLabel}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11.5px] text-[var(--text-secondary)]">
          {experienceCount(count)}
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-0.5" style={{ color: theme.color }}>
            <span className="text-[44px] font-extrabold leading-[0.82] tracking-[-0.03em] [font-feature-settings:'tnum']">
              {yesPct}
            </span>
            <span className="text-[20px] font-bold">%</span>
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
            재시술의향
          </div>
          <div className="mt-2 h-[5px] max-w-[180px] overflow-hidden rounded-full bg-white/70">
            <span
              className="block h-full rounded-full"
              style={{ width: `${yesPct}%`, backgroundColor: theme.color }}
              aria-hidden
            />
          </div>
        </div>
        <div className="flex shrink-0 gap-5 pb-0.5">
          <div className="text-center">
            <span className="mb-1.5 block text-[10.5px] font-semibold text-[var(--text-muted)]">
              통증
            </span>
            {hasPain ? (
              <span className="inline-flex items-center gap-0.5">
                <svg
                  width={11}
                  height={14}
                  viewBox="0 0 17 22"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M9.8 8.79999H15.3C15.7 8.79999 16 9.25832 15.7 9.62499L6.2 20.5333C5.9 20.9 5.3 20.625 5.3 20.1667L6.5 13.0167H1.1C0.699998 13.0167 0.399998 12.5583 0.699998 12.1917L10.2 1.37499C10.5 1.00832 11.1 1.28332 11.1 1.74166L9.9 8.89166L9.8 8.79999Z"
                    fill="#F06258"
                  />
                </svg>
                <span className="text-[20px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
                  {avgPain.toFixed(1)}
                </span>
              </span>
            ) : (
              <span className="block text-[10px] text-[var(--text-muted)]">응답 적음</span>
            )}
          </div>
          <div className="text-center">
            <span className="mb-1.5 block text-[10.5px] font-semibold text-[var(--text-muted)]">
              만족도
            </span>
            <span className="inline-flex items-baseline gap-0.5">
              <span className="text-[12px] leading-none text-[var(--accent-save)]" aria-hidden>
                ★
              </span>
              <span className="text-[20px] font-extrabold leading-none text-[var(--text)] [font-feature-settings:'tnum']">
                {avgSatisfaction.toFixed(1)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {headline && (
        <p className="mt-3.5 truncate text-[13px] text-[var(--text-secondary)]">
          {headline}
        </p>
      )}
    </div>
  );
}

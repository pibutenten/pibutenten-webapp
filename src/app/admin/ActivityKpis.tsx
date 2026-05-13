"use client";

import { useState } from "react";

type Kpi = {
  visitors: number;
  views: number;
  comments: number;
  likes: number;
  saves: number;
  shares: number;
};

// 기간 토글 6종 — 사이트 전체 통일 (24시간/7일/30일/90일/1년/전체)
const PERIODS: Array<{ label: string; days: number }> = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

/**
 * 활동 KPI 카드 (방문자/조회수/댓글/좋아요/저장/공유) — server prefetch.
 * 모든 기간 데이터를 미리 받아두고 클릭 시 즉시 스위치 (깜빡임 0).
 */
export default function ActivityKpis({
  initialDays = 7,
  dataByDays,
}: {
  initialDays?: number;
  dataByDays: Record<number, Kpi>;
}) {
  const [days, setDays] = useState(initialDays);
  const data: Kpi = dataByDays[days] ?? {
    visitors: 0,
    views: 0,
    comments: 0,
    likes: 0,
    saves: 0,
    shares: 0,
  };

  const items: Array<{ label: string; value: number }> = [
    { label: "방문자", value: data.visitors },
    { label: "조회수", value: data.views },
    { label: "댓글", value: data.comments },
    { label: "좋아요", value: data.likes },
    { label: "저장", value: data.saves },
    { label: "공유", value: data.shares },
  ];

  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
          활동 통계
        </h2>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => {
            const active = p.days === days;
            return (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
                  (active
                    ? "bg-[var(--primary)]/80 font-semibold text-white"
                    : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4"
          >
            <div className="text-xs text-[var(--text-muted)]">{it.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">
              {it.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

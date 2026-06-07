"use client";

import Link from "next/link";
import { useState } from "react";

type Kpi = {
  visitors: number;
  new_members: number;
  views: number;
  new_cards: number;
  comments: number;
  likes: number;
  saves: number;
  shares: number;
};

// 카드 라벨 → /admin/stats/{kind} 매핑 (2026-05-22: 새 회원, 새 글 추가)
const KIND_BY_LABEL: Record<string, string> = {
  방문자: "visitors",
  "새 회원": "new-members",
  조회수: "views",
  "새 글": "new-cards",
  댓글: "comments",
  좋아요: "likes",
  저장: "saves",
  공유: "shares",
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
  initialDays = 1,
  dataByDays,
}: {
  initialDays?: number;
  dataByDays: Record<number, Kpi>;
}) {
  const [days, setDays] = useState(initialDays);
  const data: Kpi = dataByDays[days] ?? {
    visitors: 0,
    new_members: 0,
    views: 0,
    new_cards: 0,
    comments: 0,
    likes: 0,
    saves: 0,
    shares: 0,
  };

  // 2026-05-22 사용자 결정 순서: 방문자/새 회원/조회수/새 글/댓글/좋아요/저장/공유 (8개)
  const items: Array<{ label: string; value: number }> = [
    { label: "방문자", value: data.visitors },
    { label: "새 회원", value: data.new_members },
    { label: "조회수", value: data.views },
    { label: "새 글", value: data.new_cards },
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
                    ? "bg-[var(--primary-active)] font-semibold text-white"
                    : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {items.map((it) => {
          const kind = KIND_BY_LABEL[it.label];
          const href = kind
            ? `/admin/stats/${kind}?days=${days || 0}`
            : null;
          // '운영 통계'(Stat) 박스와 높이 통일 — p-3 + 동일 글씨 크기(P).
          const cls =
            "block overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 transition-colors hover:bg-[var(--bg-soft)]";
          const inner = (
            <>
              <div className="whitespace-nowrap text-[11px] leading-tight text-[var(--text-muted)]">
                {it.label}
              </div>
              <div className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-[var(--text)] sm:text-2xl">
                {it.value.toLocaleString()}
              </div>
            </>
          );
          return href ? (
            <Link key={it.label} href={href} className={cls}>
              {inner}
            </Link>
          ) : (
            <div key={it.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

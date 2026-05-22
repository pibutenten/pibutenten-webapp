"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 원장 본인 활동 KPI (2026-05-22 신설) — ActivityKpis 패턴 그대로.
 *
 * 모든 기간 데이터를 server prefetch + props 로 받아 클릭 시 즉시 스위치.
 */

export type DoctorKpi = {
  views_received: number;
  comments_received: number;
  saves_received: number;
  shares_received: number;
  published_total: number;
  pending_review: number;
};

// 카드 라벨 → 클릭 시 이동할 경로 (2026-05-22 v3):
//   조회/댓글/저장/공유 → /admin/stats/{kind}?days={d} (관리자 UX 동일, 본인 글 한정 자동 적용)
//   내 글 / 검수 대기   → /admin/cards?status={x} (목록 페이지, doctor active 자동 본인 필터)
// 0148 마이그레이션 이후 RPC 가 p_doctor_id + p_author_profile_id 받아서 자동 필터링.
type KpiHref =
  | { kind: "stats"; stat: "views" | "comments" | "saves" | "shares" }
  | { kind: "cards"; status: "published" | "pending_review" }
  | null;

const KIND_BY_LABEL: Record<string, KpiHref> = {
  조회수: { kind: "stats", stat: "views" },
  댓글: { kind: "stats", stat: "comments" },
  저장: { kind: "stats", stat: "saves" },
  공유: { kind: "stats", stat: "shares" },
  "내 글": { kind: "cards", status: "published" },
  "검수 대기": { kind: "cards", status: "pending_review" },
};

function buildHref(target: KpiHref, days: number): string | null {
  if (!target) return null;
  if (target.kind === "stats") {
    return `/admin/stats/${target.stat}?days=${days || 0}`;
  }
  return `/admin/cards?status=${target.status}`;
}

const PERIODS: Array<{ label: string; days: number }> = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

export default function DoctorActivityKpis({
  initialDays = 7,
  dataByDays,
}: {
  initialDays?: number;
  dataByDays: Record<number, DoctorKpi>;
}) {
  const [days, setDays] = useState(initialDays);
  const data: DoctorKpi = dataByDays[days] ?? {
    views_received: 0,
    comments_received: 0,
    saves_received: 0,
    shares_received: 0,
    published_total: 0,
    pending_review: 0,
  };

  // 순서: 본인 글 반응 4개 → 본인 글 현황 2개
  const items: Array<{ label: string; value: number; highlight?: boolean }> = [
    { label: "조회수", value: data.views_received },
    { label: "댓글", value: data.comments_received },
    { label: "저장", value: data.saves_received },
    { label: "공유", value: data.shares_received },
    { label: "내 글", value: data.published_total },
    {
      label: "검수 대기",
      value: data.pending_review,
      highlight: data.pending_review > 0,
    },
  ];

  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
          내 글 활동
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
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        {items.map((it) => {
          const href = buildHref(KIND_BY_LABEL[it.label] ?? null, days);
          const cls =
            "block rounded-[var(--radius)] border bg-white p-4 transition-colors " +
            (it.highlight
              ? "border-amber-300 hover:bg-amber-50/40"
              : "border-[var(--border)] hover:bg-[var(--bg-soft)]");
          const inner = (
            <>
              <div className="text-xs text-[var(--text-muted)]">{it.label}</div>
              <div
                className={
                  "mt-1 text-2xl font-bold tabular-nums " +
                  (it.highlight ? "text-amber-700" : "text-[var(--text)]")
                }
              >
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

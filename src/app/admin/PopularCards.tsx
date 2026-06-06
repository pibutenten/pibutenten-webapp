"use client";

import Link from "next/link";
import { useState } from "react";

// 기간 토글 6종 — 사이트 전체 통일 (24시간/7일/30일/90일/1년/전체)
const PERIODS: Array<{ label: string; days: number }> = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

function PeriodChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PERIODS.map((p) => {
        const active = p.days === value;
        return (
          <button
            key={p.days}
            type="button"
            onClick={() => onChange(p.days)}
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
  );
}

type SearchItem = { query: string; cnt: number };
type TagItem = { keyword: string; cnt: number };

/**
 * 인기 검색어 카드 — 모든 기간 데이터를 server에서 prefetch.
 * 클릭 시 즉시 스위치 (로딩 없음, 깜빡임 없음).
 */
export function PopularSearchesCard({
  initialDays = 1,
  dataByDays,
}: {
  initialDays?: number;
  dataByDays: Record<number, SearchItem[]>;
}) {
  const [days, setDays] = useState(initialDays);
  const data = dataByDays[days] ?? [];

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">🔍 인기 검색어</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          검색 기록이 아직 없습니다.
        </p>
      ) : (
        <ol className="space-y-1">
          {data.map((s, i) => (
            <li
              key={`${s.query}-${i}`}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="w-4 text-right text-[11px] text-[var(--text-muted)]">
                  {i + 1}
                </span>
                <Link
                  href={`/search?q=${encodeURIComponent(s.query)}`}
                  className="truncate hover:text-[var(--primary)] hover:underline"
                >
                  {s.query}
                </Link>
              </span>
              <span className="tabular-nums text-[11px] text-[var(--text-muted)]">
                {s.cnt}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * 인기 태그 카드 — 모든 기간 prefetch.
 */
export function PopularTagsCard({
  initialDays = 0,
  dataByDays,
}: {
  initialDays?: number;
  dataByDays: Record<number, TagItem[]>;
}) {
  const [days, setDays] = useState(initialDays);
  const data = dataByDays[days] ?? [];

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">🏷 인기 태그</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">태그 없음.</p>
      ) : (
        <ol className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t, i) => (
            <li
              key={t.keyword}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="w-5 text-right text-[11px] text-[var(--text-muted)]">
                  {i + 1}
                </span>
                <Link
                  href={`/topics/${encodeURIComponent(t.keyword)}`}
                  className="truncate hover:text-[var(--primary)] hover:underline"
                >
                  {t.keyword}
                </Link>
              </span>
              <span className="tabular-nums text-[11px] text-[var(--text-muted)]">
                {t.cnt}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

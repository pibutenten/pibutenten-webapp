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
  // /admin/cards '전체 타입' 칩 표준 차용 (세그먼트 + --chip-active-bg).
  return (
    <div className="inline-flex flex-wrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-0.5">
      {PERIODS.map((p) => {
        const active = p.days === value;
        return (
          <button
            key={p.days}
            type="button"
            onClick={() => onChange(p.days)}
            className={
              "rounded-[var(--radius-sm)] px-3 py-1 text-xs transition-colors " +
              (active
                ? "font-semibold text-[var(--text)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
            }
            style={active ? { backgroundColor: "var(--chip-active-bg)" } : undefined}
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

const SLOTS = 30; // 30개 기준 — 항목이 줄어도 패널 높이 고정.

/**
 * 순위 그리드 — 세로 흐름(좌열 1~10·중열 11~20·우열 21~30) + 30칸 고정 높이.
 * 등수(순위 번호) 없음(카운트와 혼동 방지). 클릭 시 /search?q= 로 통일.
 * 항목이 30개 미만이어도 빈 칸을 렌더해 패널/칸 높이를 일정하게 유지.
 */
function RankGrid({ items }: { items: { label: string; cnt: number }[] }) {
  return (
    <ul
      // 세로 흐름(좌1-10·중11-20·우21-30) 3열 균등(1fr) — 우측 숫자 잘림 방지(truncate는 라벨만).
      className="grid grid-flow-col gap-x-3 [grid-template-columns:repeat(3,minmax(0,1fr))] [grid-template-rows:repeat(10,1.5rem)]"
    >
      {Array.from({ length: SLOTS }).map((_, i) => {
        const it = items[i];
        return (
          <li
            key={i}
            className="flex min-w-0 items-center justify-between gap-2 text-[13px]"
          >
            {it ? (
              <>
                <Link
                  href={`/search?q=${encodeURIComponent(it.label)}`}
                  className="min-w-0 flex-1 truncate hover:text-[var(--primary)] hover:underline"
                >
                  {it.label}
                </Link>
                <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-muted)]">
                  {it.cnt}
                </span>
              </>
            ) : (
              <span aria-hidden className="select-none opacity-0">
                ·
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

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
  const items = data.slice(0, SLOTS).map((s) => ({ label: s.query, cnt: s.cnt }));

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">인기 검색어</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      <RankGrid items={items} />
    </div>
  );
}

/**
 * 인기 태그(사용량) 카드 — 모든 기간 prefetch.
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
  const items = data.slice(0, SLOTS).map((t) => ({ label: t.keyword, cnt: t.cnt }));

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">태그 사용량</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      <RankGrid items={items} />
    </div>
  );
}

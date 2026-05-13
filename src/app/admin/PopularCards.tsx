"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PERIODS: Array<{ label: string; days: number }> = [
  { label: "7일", days: 7 },
  { label: "1개월", days: 30 },
  { label: "3개월", days: 90 },
  { label: "6개월", days: 180 },
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
                ? "bg-[var(--primary)] text-white"
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

/**
 * 인기 검색어 카드 — client 토글.
 * 기간 변경 시 RPC만 다시 호출, 페이지 reload 없음.
 */
export function PopularSearchesCard({
  initialDays = 7,
  initialData,
}: {
  initialDays?: number;
  initialData: Array<{ query: string; cnt: number }>;
}) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState(initialData);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    if (days === initialDays) return;
    startLoad(async () => {
      const sb = createSupabaseBrowserClient();
      const { data: rows } = await sb.rpc("get_top_search_queries", {
        p_days: days || 36500,
        p_limit: 10,
      });
      setData((rows ?? []) as Array<{ query: string; cnt: number }>);
    });
  }, [days, initialDays]);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">🔍 인기 검색어</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">불러오는 중…</p>
      ) : data.length === 0 ? (
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
 * 인기 태그 카드 — client 토글.
 */
export function PopularTagsCard({
  initialDays = 0,
  initialData,
}: {
  initialDays?: number;
  initialData: Array<{ keyword: string; cnt: number }>;
}) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState(initialData);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    if (days === initialDays) return;
    startLoad(async () => {
      const sb = createSupabaseBrowserClient();
      const { data: rows } = await sb.rpc("get_top_tags", {
        p_days: days,
        p_min_count: 1,
        p_limit: 10,
      });
      setData((rows ?? []) as Array<{ keyword: string; cnt: number }>);
    });
  }, [days, initialDays]);

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--text)]">🏷 인기 태그</h2>
        <PeriodChips value={days} onChange={setDays} />
      </div>
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">불러오는 중…</p>
      ) : data.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">인덱싱 태그 없음.</p>
      ) : (
        <ol className="space-y-1">
          {data.map((t, i) => (
            <li
              key={t.keyword}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="w-4 text-right text-[11px] text-[var(--text-muted)]">
                  {i + 1}
                </span>
                <Link
                  href={`/tags/${encodeURIComponent(t.keyword)}`}
                  className="truncate hover:text-[var(--primary)] hover:underline"
                >
                  #{t.keyword}
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

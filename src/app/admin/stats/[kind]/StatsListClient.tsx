"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * /admin/stats/{kind} 공통 무한 스크롤 클라이언트.
 *
 * kind:
 *   - visitors      → 회원 닉네임 + 방문 횟수
 *   - views/comments/likes/saves/shares → 글 제목 + 글쓴이 + 카운트
 */

const PERIOD_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

export type Kind =
  | "visitors"
  | "views"
  | "comments"
  | "likes"
  | "saves"
  | "shares";

export type VisitorRow = {
  profile_id: string;
  display_name: string | null;
  handle: string | null;
  visit_count: number;
};

export type QaRow = {
  qa_id: number;
  question: string | null;
  shortcode: string | null;
  author_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  cnt: number;
};

type Row = VisitorRow | QaRow;

const PAGE_SIZE = 50;

export default function StatsListClient({
  kind,
  initial,
  initialHasMore,
  initialDays,
}: {
  kind: Kind;
  initial: Row[];
  initialHasMore: boolean;
  initialDays: number;
}) {
  const [days, setDays] = useState(initialDays);
  const [rows, setRows] = useState<Row[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 기간 토글 변경 시 첫 페이지 reload
  const switchPeriod = useCallback(
    async (newDays: number) => {
      if (newDays === days) return;
      setDays(newDays);
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/stats/${kind}?days=${newDays}&offset=0&limit=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { rows: Row[]; hasMore: boolean };
        setRows(data.rows);
        setHasMore(Boolean(data.hasMore));
      } catch (e) {
        setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    },
    [kind, days],
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/stats/${kind}?days=${days}&offset=${rows.length}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rows: Row[]; hasMore: boolean };
      setRows((prev) => [...prev, ...data.rows]);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 더 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, [kind, days, rows.length, loading, hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div>
      {/* 기간 토글 — 6종 통일 */}
      <div className="mb-4 flex flex-wrap gap-1">
        {PERIOD_OPTIONS.map((opt) => {
          const active = opt.days === days;
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => switchPeriod(opt.days)}
              disabled={loading && active}
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
                (active
                  ? "bg-[var(--primary)]/80 font-semibold text-white"
                  : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* 리스트 */}
      {rows.length === 0 && !loading ? (
        <p className="rounded-md border border-dashed border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-muted)]">
          해당 기간에 데이터가 없습니다.
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={kind === "visitors" ? (r as VisitorRow).profile_id : (r as QaRow).qa_id + "-" + i}
              className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-white px-4 py-2.5"
            >
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {kind === "visitors" ? (
                  (() => {
                    const row = r as VisitorRow;
                    const name = row.display_name || row.handle || "(이름 없음)";
                    return row.handle ? (
                      <Link
                        href={`/${row.handle}`}
                        className="text-sm font-medium text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[var(--text)]">
                        {name}
                      </span>
                    );
                  })()
                ) : (
                  (() => {
                    const row = r as QaRow;
                    const qaHref = row.shortcode
                      ? `/q/${row.shortcode}`
                      : `/q/${row.qa_id}`;
                    const aname =
                      row.author_name || row.author_handle || "(작성자 없음)";
                    return (
                      <div>
                        <Link
                          href={qaHref}
                          className="block truncate text-sm font-medium text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                          title={row.question ?? undefined}
                        >
                          {row.question || "(제목 없음)"}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                          {row.author_handle ? (
                            <Link
                              href={`/${row.author_handle}`}
                              className="hover:underline"
                            >
                              @{row.author_handle}
                            </Link>
                          ) : (
                            aname
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
              <span className="shrink-0 self-center text-sm font-bold tabular-nums text-[var(--text)]">
                {kind === "visitors"
                  ? (r as VisitorRow).visit_count.toLocaleString()
                  : (r as QaRow).cnt.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* 무한 스크롤 sentinel */}
      <div
        ref={sentinelRef}
        className="mt-6 flex items-center justify-center py-4 text-xs text-[var(--text-muted)]"
      >
        {loading
          ? "불러오는 중…"
          : error
          ? `에러: ${error}`
          : hasMore
          ? ""
          : rows.length > 0
          ? "마지막입니다."
          : ""}
      </div>
    </div>
  );
}

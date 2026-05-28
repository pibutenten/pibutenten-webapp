"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * /admin/comments — 클라이언트 컴포넌트.
 *
 * 패턴:
 *   - 댓글을 최신순(created_at desc)으로 가져오되, 동일 card_id끼리 인접해 그룹화
 *   - 한 글에 최근 댓글이 여러 개면 함께 묶어서 표시 (글 제목 1번 + 댓글 N개)
 *   - IntersectionObserver로 무한 스크롤 (`/api/admin/comments?before=ISO&limit=50`)
 *
 * 그룹 정렬 키: 그 그룹 내 최신 댓글의 created_at (자연스러운 최신순)
 */

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  card_id: string;
  status?: "visible" | "hidden" | "deleted";
  screening_flags?: string[] | null;
  card: { title: string | null; shortcode: string | null } | null;
  author: { handle: string | null; display_name: string | null } | null;
};

type Group = {
  cardId: string;
  qaTitle: string;
  qaHref: string;
  latestAt: string; // 그룹 정렬 키
  comments: CommentRow[];
};

const PAGE_SIZE = 50;

function buildGroups(rows: CommentRow[]): Group[] {
  // 최신순으로 들어오므로 card_id별로 묶되, 처음 등장 순서를 유지 (Map이 insertion order 보존)
  const map = new Map<string, Group>();
  for (const r of rows) {
    const qaTitle = r.card?.title?.trim() || "(제목 없음)";
    // /q/{shortcode} 라우트 없음. admin 컨텍스트 → admin edit 페이지로
    const qaHref = `/admin/cards/${r.card_id}/edit`;
    const existing = map.get(r.card_id);
    if (existing) {
      existing.comments.push(r);
    } else {
      map.set(r.card_id, {
        cardId: r.card_id,
        qaTitle,
        qaHref,
        latestAt: r.created_at,
        comments: [r],
      });
    }
  }
  return Array.from(map.values());
}

export default function CommentsClient({
  initial,
  initialHasMore,
  statusFilter = "visible",
}: {
  initial: CommentRow[];
  initialHasMore: boolean;
  /** 배치 ⑤ (2026-05-28): visible / hidden 탭 — 자동검수 큐 분기. */
  statusFilter?: "visible" | "hidden";
}) {
  const [rows, setRows] = useState<CommentRow[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/comments?status=${statusFilter}&before=${encodeURIComponent(last.created_at)}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rows: CommentRow[]; hasMore: boolean };
      setRows((prev) => [...prev, ...data.rows]);
      setHasMore(Boolean(data.hasMore));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "댓글을 더 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, [rows, loading, hasMore, statusFilter]);

  // 자동검수 hidden 댓글 복구 — PATCH /api/comments/[id] { status: "visible" } 재사용.
  // 권한·audit 적재는 기존 라우트(배치 ②)에서 처리.
  async function restoreComment(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "visible" }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(j?.message ?? `복구 실패 (HTTP ${r.status})`);
        return;
      }
      // 화면에서 해당 row 제거 (hidden 탭에서 사라짐).
      setRows((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setBusyId(null);
    }
  }

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

  const groups = buildGroups(rows);

  return (
    <div>
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">댓글이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={`${g.cardId}-${g.latestAt}`}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4"
            >
              <Link
                href={g.qaHref}
                className="block text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)] hover:underline"
              >
                {g.qaTitle}
              </Link>
              <ul className="mt-2 space-y-2">
                {g.comments.map((c) => {
                  const authorHandle = c.author?.handle ?? null;
                  const authorName =
                    c.author?.display_name ?? authorHandle ?? "(알 수 없음)";
                  return (
                    <li key={c.id} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 text-[14px] leading-[1] text-[var(--text-muted)]"
                        aria-label="댓글"
                      >
                        ↳
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {authorHandle ? (
                            <Link
                              href={`/${authorHandle}`}
                              className="hover:underline"
                            >
                              @{authorHandle}
                            </Link>
                          ) : (
                            authorName
                          )}
                          {" · "}
                          {/* 시각 포맷은 SSR/CSR timezone 차이로 hydration mismatch 발생.
                              suppressHydrationWarning으로 워닝 격리 (실제 표시는 클라이언트 timezone 기준) */}
                          <time
                            dateTime={c.created_at}
                            suppressHydrationWarning
                          >
                            {new Date(c.created_at).toLocaleString("ko-KR", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">
                          {c.body}
                        </p>
                        {/* 자동검수 hidden 댓글 — flags + 복구 버튼 */}
                        {statusFilter === "hidden" && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {c.screening_flags && c.screening_flags.length > 0 && (
                              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                                사유: {c.screening_flags.join(", ")}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              onClick={() => restoreComment(c.id)}
                              className="rounded-md bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {busyId === c.id ? "복구 중…" : "복구 (visible)"}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* 무한 스크롤 sentinel + 상태 표시 */}
      <div
        ref={sentinelRef}
        className="mt-6 flex items-center justify-center py-4 text-xs text-[var(--text-muted)]"
      >
        {loading
          ? "더 불러오는 중…"
          : error
          ? `에러: ${error}`
          : hasMore
          ? ""
          : groups.length > 0
          ? "마지막입니다."
          : ""}
      </div>
    </div>
  );
}

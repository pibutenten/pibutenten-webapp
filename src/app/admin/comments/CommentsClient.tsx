"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * /admin/comments — 클라이언트 컴포넌트.
 *
 * 패턴:
 *   - 댓글을 최신순(created_at desc)으로 가져오되, 동일 qa_id끼리 인접해 그룹화
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
  qa: { question: string | null; shortcode: string | null } | null;
  author: { handle: string | null; display_name: string | null } | null;
};

type Group = {
  qaId: string;
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
    const qaTitle = r.qa?.question?.trim() || "(제목 없음)";
    // /q/{shortcode} 라우트 없음. admin 컨텍스트 → admin edit 페이지로
    const qaHref = `/admin/cards/${r.card_id}/edit`;
    const existing = map.get(r.card_id);
    if (existing) {
      existing.comments.push(r);
    } else {
      map.set(r.card_id, {
        qaId: r.card_id,
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
}: {
  initial: CommentRow[];
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState<CommentRow[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/comments?before=${encodeURIComponent(last.created_at)}&limit=${PAGE_SIZE}`,
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
  }, [rows, loading, hasMore]);

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
              key={`${g.qaId}-${g.latestAt}`}
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
                          {new Date(c.created_at).toLocaleString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">
                          {c.body}
                        </p>
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

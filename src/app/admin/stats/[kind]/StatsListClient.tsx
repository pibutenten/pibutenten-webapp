"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

export type CommentSummary = {
  id: number;
  card_id: number;
  body: string;
  created_at: string;
  parent_id: number | null;
  author_id: string | null;
  author:
    | { display_name: string | null; handle: string | null }
    | { display_name: string | null; handle: string | null }[]
    | null;
};

export type CardRow = {
  card_id: number;
  question: string | null;
  shortcode: string | null;
  author_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  cnt: number;
  comments?: CommentSummary[]; // comments kind 한정 — 글 밑에 항상 펼침
};

type Row = VisitorRow | CardRow;

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
          {rows.map((r, i) => {
            const isVisitors = kind === "visitors";
            const cardRow = !isVisitors ? (r as CardRow) : null;
            const visitorRow = isVisitors ? (r as VisitorRow) : null;
            const showComments =
              kind === "comments" && cardRow?.comments && cardRow.comments.length > 0;
            return (
              <li
                key={
                  isVisitors
                    ? (visitorRow as VisitorRow).profile_id
                    : (cardRow as CardRow).card_id + "-" + i
                }
                className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
              >
                {/* 한 줄 레이아웃: 닉네임(좌, 고정폭) · 제목(가운데, truncate) · 카운트(우)
                    gap-1.5 (6px) — 글쓴이↔제목 사이 시각적 거리 좁힘 (이전 gap-3, 12px) */}
                <div className="flex items-center gap-1.5 px-4 py-2">
                  {isVisitors ? (
                    (() => {
                      const row = visitorRow as VisitorRow;
                      const name =
                        row.display_name || row.handle || "(이름 없음)";
                      return (
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                          {row.handle ? (
                            <Link
                              href={`/${row.handle}`}
                              className="hover:text-[var(--primary)] hover:underline"
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const row = cardRow as CardRow;
                      // 공개 카드 URL = /{handle}/{shortcode}. handle/shortcode 없으면 admin edit 로 폴백
                      const qaHref =
                        row.author_handle && row.shortcode
                          ? `/${row.author_handle}/${row.shortcode}`
                          : `/admin/cards/${row.card_id}/edit`;
                      const displayName =
                        row.author_name?.trim() ||
                        row.author_handle?.trim() ||
                        "(작성자 없음)";
                      return (
                        <>
                          {/* 닉네임 좌측 — 고정폭(축소), 길면 truncate */}
                          <div className="w-[68px] shrink-0 truncate text-[12px] text-[var(--text-muted)] sm:w-[88px]">
                            {row.author_handle ? (
                              <Link
                                href={`/${row.author_handle}`}
                                className="hover:underline"
                              >
                                {displayName}
                              </Link>
                            ) : (
                              displayName
                            )}
                          </div>
                          {/* 제목 — 남는 공간 차지, truncate */}
                          <Link
                            href={qaHref}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                            title={row.question ?? undefined}
                          >
                            {row.question || "(제목 없음)"}
                          </Link>
                        </>
                      );
                    })()
                  )}
                  {/* 카운트 — likes/saves/shares/views는 클릭 시 활동한 사용자 펼침.
                      visitors/comments는 펼침 없음 (visitors는 한 사람 카운트, comments는 이미 펼침). */}
                  {!isVisitors &&
                  (kind === "likes" ||
                    kind === "saves" ||
                    kind === "shares" ||
                    kind === "views") ? (
                    <ActivityCountButton
                      cardId={(cardRow as CardRow).card_id}
                      kind={kind}
                      count={(cardRow as CardRow).cnt}
                    />
                  ) : (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">
                      {isVisitors
                        ? (visitorRow as VisitorRow).visit_count.toLocaleString()
                        : (cardRow as CardRow).cnt.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* 댓글 항상 펼침 — comments kind 한정 */}
                {showComments && (
                  <CommentsBlock comments={(cardRow as CardRow).comments!} />
                )}
              </li>
            );
          })}
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

/**
 * 댓글 블록 — 글 박스 하단에 항상 펼친 상태로 표시.
 * 부모(parent_id=null) → 본인 들여쓰기 0 / 답글 들여쓰기 1.
 */
function CommentsBlock({ comments }: { comments: CommentSummary[] }) {
  // 부모-자식 트리 구성. order: 부모 created_at asc, 그 아래로 답글들 asc.
  const parents = comments.filter((c) => c.parent_id == null);
  const repliesByParent = new Map<number, CommentSummary[]>();
  for (const c of comments) {
    if (c.parent_id != null) {
      const list = repliesByParent.get(c.parent_id) ?? [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }
  }
  // 고아 답글(부모 없음)도 표시 — 부모를 못 받은 경우 그냥 부모처럼 렌더
  const orphanReplies = comments.filter(
    (c) =>
      c.parent_id != null && !parents.some((p) => p.id === c.parent_id),
  );

  return (
    <div className="border-t border-[var(--border)] bg-slate-50 px-4 py-2">
      <ul className="space-y-1.5">
        {parents.map((c) => {
          const replies = repliesByParent.get(c.id) ?? [];
          return (
            <li key={c.id}>
              <CommentLine comment={c} depth={0} />
              {replies.map((r) => (
                <CommentLine key={r.id} comment={r} depth={1} />
              ))}
            </li>
          );
        })}
        {orphanReplies.map((r) => (
          <li key={r.id}>
            <CommentLine comment={r} depth={0} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 활동 카운트 버튼 — 클릭 시 그 카드의 활동 사용자 N명 inline 펼침.
 * likes/saves/shares/views 한정 (visitors/comments는 별도 패턴).
 */
type ActivityUser = {
  profile_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  acted_at: string;
};

function ActivityCountButton({
  cardId,
  kind,
  count,
}: {
  cardId: number;
  kind: "likes" | "saves" | "shares" | "views";
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ActivityUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && users === null) {
      setLoading(true);
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.rpc("get_card_activity_users", {
          p_card_id: cardId,
          p_kind: kind,
          p_limit: 30,
        });
        setUsers((data ?? []) as ActivityUser[]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="shrink-0 rounded px-2 py-0.5 text-sm font-bold tabular-nums text-[var(--text)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
        title="클릭하면 활동한 사용자를 펼쳐서 봅니다"
      >
        {count.toLocaleString()}
      </button>
      {open && (
        <ActivityUsersInline
          users={users}
          loading={loading}
          count={count}
        />
      )}
    </>
  );
}

function ActivityUsersInline({
  users,
  loading,
  count,
}: {
  users: ActivityUser[] | null;
  loading: boolean;
  count: number;
}) {
  return (
    <div className="basis-full border-t border-[var(--border)] bg-slate-50 px-4 py-2 -mx-4 mt-2">
      {loading || users === null ? (
        <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">활동한 사용자가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
          {users.map((u) => {
            const name =
              u.display_name?.trim() || u.handle?.trim() || "(이름 없음)";
            return u.handle ? (
              <Link
                key={u.profile_id}
                href={`/${u.handle}`}
                className="text-[var(--text-secondary)] hover:text-[var(--primary)] hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span key={u.profile_id} className="text-[var(--text-secondary)]">
                {name}
              </span>
            );
          })}
          {count > users.length && (
            <span className="text-[var(--text-muted)]">
              외 {(count - users.length).toLocaleString()}명
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CommentLine({
  comment,
  depth,
}: {
  comment: CommentSummary;
  depth: 0 | 1;
}) {
  const a = Array.isArray(comment.author)
    ? comment.author[0] ?? null
    : comment.author;
  const aname =
    a?.display_name?.trim() || a?.handle?.trim() || "(알 수 없음)";
  const ahandle = a?.handle ?? null;
  const time = new Date(comment.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className="flex items-start gap-1.5 py-0.5"
      style={{ paddingLeft: depth === 1 ? 20 : 0 }}
    >
      {depth === 1 && (
        <span
          aria-hidden
          className="mt-0.5 select-none text-[12px] leading-[1] text-[var(--text-muted)]"
        >
          ↳
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] text-[var(--text-muted)]">
          {ahandle ? (
            <Link href={`/${ahandle}`} className="hover:underline">
              {aname}
            </Link>
          ) : (
            aname
          )}
          {" · "}
          {time}
        </div>
        <p className="whitespace-pre-wrap text-[12px] leading-snug text-[var(--text-secondary)]">
          {comment.body}
        </p>
      </div>
    </div>
  );
}

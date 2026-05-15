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
  // 의사 글 메타 — publicCardUrl 정책 분기에 사용 (API route 의 cards join 으로 채움)
  category?: string | null;
  doctor_slug?: string | null;
  post_year?: number | null;
  post_slug?: string | null;
};

/**
 * 카드 공개 URL — 정책 (사용자 결정 2026-05-15):
 *   1) 의사 Q&A (category='qa' + doctor 메타 충족) → /doctors/{slug}/{year}/{post_slug}
 *   2) 그 외 모든 글 (의사의 비-qa 카테고리 포함) → /{author_handle}/{shortcode}
 *
 * 향후 정책 변경은 본 함수의 분기 한 줄만 바꾸면 됨.
 */
function publicCardUrl(row: CardRow): string | null {
  if (
    row.category === "qa" &&
    row.doctor_slug &&
    row.post_year &&
    row.post_slug
  ) {
    return `/doctors/${row.doctor_slug}/${row.post_year}/${row.post_slug}`;
  }
  if (row.author_handle && row.shortcode) {
    return `/${row.author_handle}/${row.shortcode}`;
  }
  return null;
}

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
                {/* 한 줄 레이아웃: 닉네임(좌, 고정폭 축소) · 제목(가운데, truncate) · 카운트(우).
                    gap-1 (4px) — 닉네임↔제목 사이 거리 추가 단축, 제목 시작이 더 왼쪽으로 자연스럽게 붙음. */}
                {isVisitors ? (
                  <div className="flex items-center gap-1 px-4 py-2">
                    {(() => {
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
                    })()}
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">
                      {(visitorRow as VisitorRow).visit_count.toLocaleString()}
                    </span>
                  </div>
                ) : kind === "comments" ? (
                  // 댓글 TOP — 글 제목은 단독 URL link, 댓글은 항상 펼침 (옛 동작 유지)
                  <CommentsTopRow row={cardRow as CardRow} showComments={!!showComments} />
                ) : (
                  // likes/saves/shares/views TOP — 글 제목·카운트 클릭 모두 닉네임 펼침 토글.
                  // 펼친 창 클릭하면 글 단독 URL 로 이동.
                  <ActivityTopRow row={cardRow as CardRow} kind={kind} />
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

/**
 * likes/saves/shares/views TOP 한 행.
 *  - 글 제목 클릭 / 카운트 클릭 모두 같은 펼침 토글
 *  - 펼친 창 = 활동한 닉네임 나열 + 영역 어디든 클릭하면 그 글 단독 URL 로 이동
 */
function ActivityTopRow({
  row,
  kind,
}: {
  row: CardRow;
  kind: "likes" | "saves" | "shares" | "views";
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ActivityUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  // 공개 카드 URL — 의사 글 /doctors/{slug}/{year}/{shortcode} 우선, 회원 글 /{handle}/{shortcode}.
  // 둘 다 없으면 null → link 비활성 (편집기로 가는 fallback 제거).
  const cardHref = publicCardUrl(row);
  const displayName =
    row.author_name?.trim() ||
    row.author_handle?.trim() ||
    "(작성자 없음)";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && users === null) {
      setLoading(true);
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.rpc("get_card_activity_users", {
          p_card_id: row.card_id,
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
      <div className="flex items-center gap-1 px-4 py-2">
        {/* 닉네임 좌측 — 폭 축소 (52→72), 길면 truncate. 사용자 프로필 link 유지 */}
        <div className="w-[52px] shrink-0 truncate text-[12px] text-[var(--text-muted)] sm:w-[72px]">
          {row.author_handle ? (
            <Link
              href={`/${row.author_handle}`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
          ) : (
            displayName
          )}
        </div>
        {/* 제목 — 클릭 시 펼침 토글 (편집기 navigate 가 아닌). aria-expanded 로 a11y 표현. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--text)] hover:text-[var(--primary)]"
          title={row.question ?? undefined}
        >
          {row.question || "(제목 없음)"}
        </button>
        {/* 카운트도 같은 펼침 toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="shrink-0 rounded px-2 py-0.5 text-sm font-bold tabular-nums text-[var(--text)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
          title="클릭하면 활동한 사용자를 펼쳐서 봅니다"
        >
          {row.cnt.toLocaleString()}
        </button>
      </div>
      {open && (
        <ActivityUsersInline
          users={users}
          loading={loading}
          count={row.cnt}
          cardHref={cardHref}
        />
      )}
    </>
  );
}

/**
 * 댓글 TOP — 글 제목은 단독 URL link, 댓글은 항상 펼침 (옛 동작 유지).
 * activity TOP 과 분리해서 영역 책임 명확.
 */
function CommentsTopRow({
  row,
  showComments,
}: {
  row: CardRow;
  showComments: boolean;
}) {
  const cardHref = publicCardUrl(row);
  const displayName =
    row.author_name?.trim() ||
    row.author_handle?.trim() ||
    "(작성자 없음)";
  return (
    <>
      <div className="flex items-center gap-1 px-4 py-2">
        <div className="w-[52px] shrink-0 truncate text-[12px] text-[var(--text-muted)] sm:w-[72px]">
          {row.author_handle ? (
            <Link href={`/${row.author_handle}`} className="hover:underline">
              {displayName}
            </Link>
          ) : (
            displayName
          )}
        </div>
        {cardHref ? (
          <Link
            href={cardHref}
            className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)] hover:text-[var(--primary)] hover:underline"
            title={row.question ?? undefined}
          >
            {row.question || "(제목 없음)"}
          </Link>
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]"
            title={row.question ?? undefined}
          >
            {row.question || "(제목 없음)"}
          </span>
        )}
        <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">
          {row.cnt.toLocaleString()}
        </span>
      </div>
      {showComments && row.comments && (
        <CommentsBlock comments={row.comments} />
      )}
    </>
  );
}

function ActivityUsersInline({
  users,
  loading,
  count,
  cardHref,
}: {
  users: ActivityUser[] | null;
  loading: boolean;
  count: number;
  /** 펼친 창 전체를 감싸는 link target. null 이면 link 비활성 (편집기 fallback 차단). */
  cardHref: string | null;
}) {
  // count vs users.length mismatch 의 정확한 의미:
  //  - likes/saves: 한 사람당 1행만 가능 → count == users.length (mismatch 거의 0)
  //  - shares/views: 한 사람이 여러 번 가능 → count > users.length (정상)
  //  - 따라서 '외 N명' 은 RPC limit(30) 으로 잘린 사용자가 있을 때만 의미 있음.
  //    개별 사용자 수는 users.length(distinct).
  void count;
  // 닉네임 자체는 텍스트 표시 (사용자 프로필 link 아님). 창 어디 클릭하든 글 단독 URL.
  const inner = (
    <div className="border-t border-[var(--border)] bg-slate-50 px-4 py-2 transition-colors group-hover:bg-[var(--bg-soft)]">
      {loading || users === null ? (
        <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">활동한 사용자가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
          {users.map((u) => {
            const name =
              u.display_name?.trim() || u.handle?.trim() || "(이름 없음)";
            return (
              <span key={u.profile_id} className="text-[var(--text-secondary)]">
                {name}
              </span>
            );
          })}
          {users.length >= 30 && (
            <span className="text-[var(--text-muted)]">외 더…</span>
          )}
        </div>
      )}
    </div>
  );
  // cardHref null — 회원 글이 아니거나 의사 글 메타가 없는 경우 link 비활성 (편집기 fallback 차단).
  if (!cardHref) return inner;
  return (
    <Link href={cardHref} className="group block" title="글 보기">
      {inner}
    </Link>
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

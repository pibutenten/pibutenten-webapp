"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react"; // useEffect 추가 사용
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { labelForCategory } from "@/lib/post-category";
import { ROLES } from "@/lib/identity-shared";

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
  | "shares"
  | "new-members"
  | "new-cards";

export type VisitorRow = {
  // 비로그인 방문자 합계 행은 profile_id = null (0117 정책)
  profile_id: string | null;
  display_name: string | null;
  handle: string | null;
  visit_count: number;
  // 2026-05-22 (0145): 최근 방문 시각 — 동률 시 최신순 정렬용
  last_visit_at?: string | null;
};

export type NewMemberRow = {
  profile_id: string;
  display_name: string | null;
  handle: string | null;
  role: string | null;
  created_at: string;
};

export type NewCardRow = {
  card_id: number;
  title: string | null;
  shortcode: string | null;
  author_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  created_at: string;
  category?: string | null;
  doctor_slug?: string | null;
  post_year?: number | null;
  post_slug?: string | null;
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
  title: string | null;
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
 * 카드 URL — 사용자 정책 (2026-05-17 v3, 편집기 fallback 제거):
 *   1) 의사 Q&A (category='qa' + doctor 메타 충족) → /doctors/{slug}/{year}/{post_slug}
 *   2) 그 외 모든 글 (handle + shortcode 충족) → /{author_handle}/{shortcode}
 *   3) **fallback** → /cards/{id} (server redirect 페이지가 canonical 재계산 후 302)
 *      편집기로는 절대 떨어지지 않음. 메타 부분 누락 카드도 공개 페이지로.
 *
 * 변경 이력:
 *   - v1 (오전): null 분기 → Link 미적용 → 일부 행 클릭 불가
 *   - v2 (오후): /admin/cards/{id}/edit fallback → 사용자 보고 "편집기로 가버림"
 *   - v3 (현재): /cards/{id} redirect 페이지 → 항상 공개 카드로
 */
function publicCardUrl(row: CardRow): string {
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
  return `/cards/${row.card_id}`;
}

type Row = VisitorRow | CardRow | NewMemberRow | NewCardRow;

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
                  ? "bg-[var(--primary-active)] font-semibold text-white"
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
      ) : kind === "visitors" ? (
        // 2026-05-22: 방문자 = 칩 layout (한 줄에 여러 명). 비로그인 항상 맨 앞 (RPC 정렬).
        <div className="flex flex-wrap gap-2">
          {(rows as VisitorRow[]).map((row, i) => {
            const name = row.display_name || row.handle || "(이름 없음)";
            const key = row.profile_id ?? `anon-${i}`;
            const chipBase =
              "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[13px]";
            const inner = (
              <>
                <span className="text-[var(--text)]">{name}</span>
                <span className="font-bold tabular-nums text-[var(--primary)]">
                  {row.visit_count.toLocaleString()}
                </span>
              </>
            );
            return row.handle ? (
              <Link
                key={key}
                href={`/${row.handle}`}
                className={`${chipBase} transition-colors hover:border-[var(--primary)]`}
              >
                {inner}
              </Link>
            ) : (
              <div key={key} className={chipBase}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : kind === "new-members" ? (
        <ol className="space-y-2">
          {(rows as NewMemberRow[]).map((r) => (
            <li
              key={r.profile_id}
              className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
            >
              <NewMemberRowItem row={r} />
            </li>
          ))}
        </ol>
      ) : kind === "new-cards" ? (
        <ol className="space-y-2">
          {(rows as NewCardRow[]).map((r) => (
            <li
              key={r.card_id}
              className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
            >
              <NewCardRowItem row={r} />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {(rows as CardRow[]).map((cardRow) => (
            <li
              key={cardRow.card_id}
              className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
            >
              <ActivityTopRow row={cardRow} kind={kind} days={days} />
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

/**
 * 신규 회원 한 행 — 닉네임 + 가입일 + (있으면) 프로필 link.
 */
function NewMemberRowItem({ row }: { row: NewMemberRow }) {
  const name = row.display_name || row.handle || "(이름 없음)";
  const joinedAt = new Date(row.created_at).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-2 px-4 py-2">
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
        {row.role && row.role !== ROLES.USER && (
          <span className="ml-1.5 rounded-full bg-[var(--bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {row.role}
          </span>
        )}
      </div>
      <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
        {joinedAt}
      </span>
    </div>
  );
}

/**
 * 신규 글 한 행 — 제목 + 작성자 + 발행일. 글 단독 페이지로 link.
 */
function NewCardRowItem({ row }: { row: NewCardRow }) {
  const author = row.author_name || row.author_handle || "(작성자 없음)";
  const createdAt = new Date(row.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const cardHref = publicCardUrl({
    card_id: row.card_id,
    title: row.title,
    shortcode: row.shortcode,
    author_id: row.author_id,
    author_name: row.author_name,
    author_handle: row.author_handle,
    cnt: 0,
    category: row.category ?? null,
    doctor_slug: row.doctor_slug ?? null,
    post_year: row.post_year ?? null,
    post_slug: row.post_slug ?? null,
  });
  const categoryLabel = labelForCategory(row.category ?? null);
  return (
    <Link href={cardHref} className="block transition-colors hover:bg-[var(--bg-soft)]">
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="w-[52px] shrink-0 truncate text-[12px] text-[var(--text-muted)] sm:w-[72px]">
          {author}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
          {categoryLabel && (
            <span className="mr-1.5 text-[var(--text-muted)]">{categoryLabel}</span>
          )}
          {row.title || "(제목 없음)"}
        </div>
        <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
          {createdAt}
        </span>
      </div>
    </Link>
  );
}

/**
 * 활동 카운트 버튼 — 클릭 시 그 카드의 활동 내역 inline 펼침.
 * likes/saves/shares/views = 활동 사용자 N명 / comments = 댓글 1줄씩.
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
  days,
}: {
  row: CardRow;
  kind: "likes" | "saves" | "shares" | "views" | "comments";
  /** 활동 사용자 RPC 호출에 전달할 시간 윈도우 (cnt 와 일치 보장). */
  days: number;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ActivityUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  // days 변경 시 캐시 무효화 — 시간 윈도우 바뀌면 다음 펼침 때 재조회.
  useEffect(() => {
    setUsers(null);
    setOpen(false);
  }, [days]);

  // 카드 URL — publicCardUrl 가 항상 valid string 반환 (메타 누락 시 /cards/{id} server redirect).
  const cardHref = publicCardUrl(row);
  const displayName =
    row.author_name?.trim() ||
    row.author_handle?.trim() ||
    "(작성자 없음)";

  // 댓글의 경우 펼친 패널은 row.comments 를 그대로 사용 (RPC 호출 없음).
  // likes/saves/shares/views 는 get_card_activity_users RPC 호출.
  // 2026-05-20 fix: p_days 전달 — cnt(시간 윈도우) ↔ 닉네임 칩(시간 윈도우) 일치 보장.
  //   옛 RPC는 윈도우 없이 전체 기간 → cnt 6 인데 칩 14명 mismatch 회귀 발생.
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && kind !== "comments" && users === null) {
      setLoading(true);
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.rpc("get_card_activity_users", {
          p_card_id: row.card_id,
          p_kind: kind,
          p_limit: 30,
          p_days: days,
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
        {/* 제목 — 클릭 시 펼침 토글. 카테고리 라벨 (연한 글씨) 앞에 prepend. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--text)] hover:text-[var(--primary)]"
          title={row.title ?? undefined}
        >
          {(() => {
            const cat = labelForCategory(row.category ?? null);
            return cat ? (
              <span className="mr-1.5 font-normal text-[var(--text-muted)]">
                {cat}
              </span>
            ) : null;
          })()}
          {row.title || "(제목 없음)"}
        </button>
        {/* 카운트도 같은 펼침 toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="shrink-0 rounded px-2 py-0.5 text-sm font-bold tabular-nums text-[var(--text)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
          title="클릭하면 활동 내역을 펼쳐서 봅니다"
        >
          {row.cnt.toLocaleString()}
        </button>
      </div>
      {open && (
        kind === "comments" ? (
          <CommentsInline comments={row.comments ?? []} cardHref={cardHref} />
        ) : (
          <ActivityUsersInline
            users={users}
            loading={loading}
            count={row.cnt}
            cardHref={cardHref}
          />
        )
      )}
    </>
  );
}

/**
 * 댓글 펼침 패널 — likes/saves 등 ActivityUsersInline 와 동일 UX.
 *  - 패널 영역 어디든 클릭 → 글 단독 URL 로 이동 (publicCardUrl 항상 valid)
 *  - 한 댓글 = 1줄: 닉네임 · 시간 · 본문. 본문이 길면 자연 wrap.
 *  - 답글은 들여쓰기 1단으로 inline.
 *  - 본문 앞뒤 공백·줄바꿈 trim (사용자 요청).
 */
function CommentsInline({
  comments,
  cardHref,
}: {
  comments: CommentSummary[];
  cardHref: string;
}) {
  if (comments.length === 0) {
    return (
      <Link href={cardHref} className="group block" title="글 보기">
        <div className="border-t border-[var(--border)] bg-slate-50 px-4 py-2">
          <p className="text-[11px] text-[var(--text-muted)]">댓글이 없습니다.</p>
        </div>
      </Link>
    );
  }
  // 부모-자식 트리 구성 (CommentsBlock 와 동일)
  const parents = comments.filter((c) => c.parent_id == null);
  const repliesByParent = new Map<number, CommentSummary[]>();
  for (const c of comments) {
    if (c.parent_id != null) {
      const list = repliesByParent.get(c.parent_id) ?? [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }
  }
  const orphanReplies = comments.filter(
    (c) =>
      c.parent_id != null && !parents.some((p) => p.id === c.parent_id),
  );

  return (
    <Link href={cardHref} className="group block" title="글 보기">
      <div className="border-t border-[var(--border)] bg-slate-50 px-4 py-2 transition-colors group-hover:bg-[var(--bg-soft)]">
        <ul className="space-y-1">
          {parents.map((c) => {
            const replies = repliesByParent.get(c.id) ?? [];
            return (
              <li key={c.id}>
                <CommentInlineLine comment={c} depth={0} />
                {replies.map((r) => (
                  <CommentInlineLine key={r.id} comment={r} depth={1} />
                ))}
              </li>
            );
          })}
          {orphanReplies.map((r) => (
            <li key={r.id}>
              <CommentInlineLine comment={r} depth={0} />
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}

/**
 * 댓글 1줄 — 닉네임 · 시간 · 본문(앞뒤 공백/줄바꿈 trim, 길면 자연 wrap).
 * depth=1 답글은 좌측 들여쓰기.
 */
function CommentInlineLine({
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
  const time = new Date(comment.created_at).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  // 본문 앞뒤 공백/줄바꿈 제거. 내부 줄바꿈은 단일 공백으로 축약해 한 줄로 자연스럽게 흐르게.
  const bodyText = comment.body.replace(/\s+/g, " ").trim();
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] leading-snug"
      style={{ paddingLeft: depth === 1 ? 20 : 0 }}
    >
      {depth === 1 && (
        <span
          aria-hidden
          className="select-none text-[12px] leading-[1] text-[var(--text-muted)]"
        >
          ↳
        </span>
      )}
      <span className="font-medium text-[var(--text)]">{aname}</span>
      <span className="text-[10.5px] text-[var(--text-muted)]">· {time}</span>
      <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
        {bodyText}
      </span>
    </div>
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
  /** 펼친 창 전체를 감싸는 link target — publicCardUrl 가 항상 valid string 보장. */
  cardHref: string;
}) {
  // count vs users.length mismatch 의 정확한 의미:
  //  - likes/saves: 한 사람당 1행만 가능 → count == users.length (mismatch 거의 0)
  //  - shares/views: 한 사람이 여러 번 가능 → count > users.length (정상)
  //  - 따라서 '외 N명' 은 RPC limit(30) 으로 잘린 사용자가 있을 때만 의미 있음.
  //    개별 사용자 수는 users.length(distinct).
  void count;
  return (
    <Link href={cardHref} className="group block" title="글 보기">
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
    </Link>
  );
}


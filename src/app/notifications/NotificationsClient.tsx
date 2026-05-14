"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * /notifications — 알림 전체 페이지.
 *
 * - 50개씩 무한 스크롤 (IntersectionObserver)
 * - 필터 칩: 전체 / 댓글 / 답글 / 좋아요 / 궁금해요 / 운영 (doctor/admin만)
 * - kind 6종 라벨 (NotificationsBell과 동기화)
 * - 알림 클릭 시 notifications.url 직접 사용 (0071 migration에서 정합된 경로)
 * - 페이지 진입 시 자동 모두 읽음 (단 ask 본인 미답 알림은 mark_my_notifications_read RPC 측에서 제외 — Step B에서)
 */

type Kind =
  | "comment"
  | "reply"
  | "like"
  | "new_ask"
  | "review_request"
  | "published";

type Notification = {
  id: number;
  kind: Kind | string;
  card_id: number | null;
  comment_id: number | null;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_handle: string | null;
  card_question: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  comment: "내 글에 댓글을 남겼어요",
  reply: "내 댓글에 답글을 남겼어요",
  like: "내 글에 좋아요를 눌렀어요",
  new_ask: "새 궁금해요 글이 올라왔어요",
  review_request: "새 검수 요청이 도착했어요",
  published: "내 글이 발행되었어요",
};

const KIND_ICON: Record<string, string> = {
  comment: "💬",
  reply: "↳",
  like: "❤",
  new_ask: "❓",
  review_request: "🩺",
  published: "🚀",
};

type FilterKey = "all" | "comment" | "reply" | "like" | "new_ask" | "ops";

const FILTER_KINDS: Record<FilterKey, Kind[] | null> = {
  all: null,
  comment: ["comment"],
  reply: ["reply"],
  like: ["like"],
  new_ask: ["new_ask"],
  ops: ["review_request", "published"],
};

const PAGE_SIZE = 50;

export default function NotificationsClient({
  showOps,
}: {
  showOps: boolean;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  // 1) 초기 + 모두 읽음 처리 (페이지 진입 시 1회)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb.rpc("get_notifications", {
        p_offset: 0,
        p_limit: PAGE_SIZE,
      });
      if (cancelled) return;
      const rows = (data ?? []) as Notification[];
      setItems(rows);
      offsetRef.current = rows.length;
      setDone(rows.length < PAGE_SIZE);
      setLoading(false);

      // 모두 읽음 처리 — RPC가 ask 본인 미답 알림은 제외 (Step B에서)
      await sb.rpc("mark_notifications_read", { p_ids: null });
      window.dispatchEvent(new CustomEvent("pibutenten:notifications-read"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 더 불러오기
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || done) return;
    fetchingRef.current = true;
    const sb = createSupabaseBrowserClient();
    const { data } = await sb.rpc("get_notifications", {
      p_offset: offsetRef.current,
      p_limit: PAGE_SIZE,
    });
    const rows = (data ?? []) as Notification[];
    if (rows.length > 0) {
      setItems((prev) => [...prev, ...rows]);
      offsetRef.current += rows.length;
    }
    if (rows.length < PAGE_SIZE) setDone(true);
    fetchingRef.current = false;
  }, [done]);

  // 3) IntersectionObserver — sentinel 보이면 더 불러오기
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // 4) 필터링 (client side — 이미 fetch된 알림만 대상)
  const visible = items.filter((n) => {
    const allowed = FILTER_KINDS[filter];
    if (!allowed) return true;
    return allowed.includes(n.kind as Kind);
  });

  return (
    <div>
      {/* 필터 칩 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip
          label="전체"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label="댓글"
          active={filter === "comment"}
          onClick={() => setFilter("comment")}
        />
        <FilterChip
          label="답글"
          active={filter === "reply"}
          onClick={() => setFilter("reply")}
        />
        <FilterChip
          label="좋아요"
          active={filter === "like"}
          onClick={() => setFilter("like")}
        />
        <FilterChip
          label="궁금해요"
          active={filter === "new_ask"}
          onClick={() => setFilter("new_ask")}
        />
        {showOps && (
          <FilterChip
            label="운영"
            active={filter === "ops"}
            onClick={() => setFilter("ops")}
          />
        )}
      </div>

      {/* 본문 */}
      {loading ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)]">
          {filter === "all"
            ? "아직 알림이 없어요."
            : "해당 종류의 알림이 없어요."}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)] bg-white">
          {visible.map((n) => (
            <NotificationRow key={n.id} n={n} />
          ))}
        </ul>
      )}

      {/* 무한 스크롤 sentinel */}
      {!done && !loading && (
        <div
          ref={sentinelRef}
          className="py-6 text-center text-xs text-[var(--text-muted)]"
        >
          더 불러오는 중…
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (active
          ? "border-[var(--primary)] bg-[var(--primary)]/80 text-white"
          : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
      }
    >
      {label}
    </button>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const text = KIND_LABEL[n.kind] ?? "새 알림";
  const icon = KIND_ICON[n.kind] ?? "•";
  const actorName = n.actor_display_name ?? "회원";
  const initial = actorName.slice(0, 1);
  const actorHref = n.actor_handle ? `/${n.actor_handle}` : null;
  // notifications.url 직접 사용 (0071 migration에서 /{handle}/{shortcode} 또는 /admin/cards/{id}/edit로 정합)
  const target = n.url ?? (n.card_id ? `/?_=${n.card_id}` : "/");
  const time = relativeTime(n.created_at);
  const unread = !n.read_at;

  // new_ask / review_request / published 는 actor가 의미 없거나 시스템 알림 — 아바타 대신 아이콘
  const showActorAvatar =
    n.kind === "comment" || n.kind === "reply" || n.kind === "like";

  return (
    <li
      className={
        "flex items-center gap-3 px-4 py-3 " +
        (unread ? "bg-[var(--primary-soft)]" : "")
      }
    >
      {showActorAvatar && actorHref ? (
        <Link href={actorHref} className="shrink-0">
          <Avatar src={n.actor_avatar_url} initial={initial} />
        </Link>
      ) : showActorAvatar ? (
        <Avatar src={n.actor_avatar_url} initial={initial} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[18px]">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-tight text-[var(--text)]">
          {showActorAvatar && actorHref ? (
            <Link href={actorHref} className="font-semibold hover:underline">
              {actorName}
            </Link>
          ) : showActorAvatar ? (
            <span className="font-semibold">{actorName}</span>
          ) : null}
          {showActorAvatar && <span className="text-[var(--text-secondary)]"> {text}</span>}
          {!showActorAvatar && (
            <span className="font-semibold text-[var(--text)]">{text}</span>
          )}
        </div>
        {n.card_question && (
          <Link
            href={target}
            className="mt-1 block truncate text-[12.5px] text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            ↳ {n.card_question}
          </Link>
        )}
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{time}</div>
      </div>
    </li>
  );
}

function Avatar({
  src,
  initial,
}: {
  src: string | null;
  initial: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg-soft)] object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[14px] font-semibold text-[var(--text-secondary)]">
      {initial}
    </span>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR");
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Notification = {
  id: number;
  kind: "comment" | "reply" | "qa_like" | "comment_like" | "system" | string;
  qa_id: number | null;
  comment_id: number | null;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_handle: string | null;
  qa_question: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_TEXT: Record<string, string> = {
  comment: "내 글에 댓글을 남겼어요",
  reply: "내 댓글에 답글을 남겼어요",
  qa_like: "내 글에 좋아요를 눌렀어요",
  comment_like: "내 댓글에 좋아요를 눌렀어요",
  system: "공지",
};

export default function NotificationsClient() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb.rpc("get_notifications", {
        p_offset: 0,
        p_limit: 100,
      });
      if (cancelled) return;
      setItems((data ?? []) as Notification[]);
      setLoading(false);

      // 페이지 진입 시 미읽 → 읽음 처리 (전체)
      await sb.rpc("mark_notifications_read", { p_ids: null });
      // 헤더 배지 즉시 refetch
      window.dispatchEvent(new CustomEvent("pibutenten:notifications-read"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
        불러오는 중…
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)]">
        아직 알림이 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)] bg-white">
      {items.map((n) => (
        <NotificationRow key={n.id} n={n} />
      ))}
    </ul>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const text = KIND_TEXT[n.kind] ?? "새 알림";
  const actorName = n.actor_display_name ?? "회원";
  const initial = actorName.slice(0, 1);
  const actorHref = n.actor_handle ? `/${n.actor_handle}` : null;
  // 알림 클릭 시 가는 곳 — 일단 글 단독 페이지 (qa_id 있을 때)
  // qa URL은 알 수 없으니 fallback /. 향후 RPC에서 canonical URL 같이 반환하면 정확화.
  const target = n.qa_id ? `/?_=${n.qa_id}` : "/";
  const time = relativeTime(n.created_at);
  const unread = !n.read_at;

  return (
    <li
      className={
        "flex items-center gap-3 px-4 py-3 " +
        (unread ? "bg-[var(--primary-soft)]" : "")
      }
    >
      {actorHref ? (
        <Link href={actorHref} className="shrink-0">
          <Avatar src={n.actor_avatar_url} initial={initial} />
        </Link>
      ) : (
        <Avatar src={n.actor_avatar_url} initial={initial} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-tight text-[var(--text)]">
          {actorHref ? (
            <Link
              href={actorHref}
              className="font-semibold hover:underline"
            >
              {actorName}
            </Link>
          ) : (
            <span className="font-semibold">{actorName}</span>
          )}
          <span className="text-[var(--text-secondary)]">
            {" "}
            {text}
          </span>
        </div>
        {n.qa_question && (
          <Link
            href={target}
            className="mt-1 block truncate text-[12.5px] text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            ↳ {n.qa_question}
          </Link>
        )}
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {time}
        </div>
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

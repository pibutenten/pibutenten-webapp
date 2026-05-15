"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 우상단 종 아이콘 + 미확인 배지 + 드롭다운.
 *
 * - 60초마다 unread count 폴링
 * - PWA Badge API (navigator.setAppBadge) — 홈 아이콘 위 숫자 (지원 OS만)
 * - 클릭 시 dropdown 펼침 + 모두 읽음 처리
 * - 항목 클릭 시 url로 이동
 */

type NotificationItem = {
  id: number;
  kind:
    | "comment"
    | "reply"
    | "like"
    | "new_ask"
    | "review_request"
    | "published";
  actor_id: string | null;
  actor_name: string | null;
  actor_handle: string | null;
  card_id: number | null;
  comment_id: number | null;
  message: string;
  url: string;
  read_at: string | null;
  created_at: string;
};

const POLL_MS = 60_000;

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // 드롭다운 fixed 위치 — viewport 좌표 기준. wrapper transform/overflow 영향 무관.
  // 카카오/네이버 인앱 브라우저에서 absolute 가 viewport 좌측 너머로 잘리는 현상 회피.
  const [dropTop, setDropTop] = useState<number>(64);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NotificationItem[];
        unread: number;
      };
      setItems(data.items);
      setUnread(data.unread);
      // PWA Badge API (지원 안 하면 silent fail) — Navigator에 타입이 없어 record cast
      try {
        const nav = navigator as unknown as Record<string, (n?: number) => void>;
        if (typeof nav.setAppBadge === "function") {
          if (data.unread > 0) nav.setAppBadge(data.unread);
          else nav.clearAppBadge?.();
        }
      } catch {
        /* noop */
      }
    } catch {
      /* noop */
    }
  }, []);

  // 초기 fetch + polling (fetchData는 async — setState는 await 이후 발생, false positive)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    const id = setInterval(() => void fetchData(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // 탭 복귀 시 즉시 refetch — 폴링 사이 백그라운드에서 새 알림이 생긴 경우 빠른 반영
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") void fetchData();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchData]);

  // pibutenten:notifications-read 이벤트 수신 — 다른 컴포넌트(예: /notifications 페이지)가 읽음 처리 시 동기화
  useEffect(() => {
    function onRead() {
      void fetchData();
    }
    window.addEventListener("pibutenten:notifications-read", onRead);
    return () => window.removeEventListener("pibutenten:notifications-read", onRead);
  }, [fetchData]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // 드롭다운 위치 — bell button 의 viewport 좌표 기준 top.
  // open 시 1회 측정. scroll 발생 시 닫힘 처리(외부 클릭 listener 가 처리).
  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setDropTop(rect.bottom + 6);
  }, [open]);

  // 열릴 때 모두 읽음 처리 (RPC가 '궁금해요' 본인 미답 알림은 제외 — migration 0080)
  async function handleOpen() {
    setOpen(true);
    if (unread === 0) return;
    setLoading(true);
    try {
      await fetch("/api/notifications/read", { method: "POST" });
      // 서버 RPC가 ask 본인 미답 알림을 제외할 수 있으므로 클라이언트 unread는 다시 fetch로 동기화
      void fetchData();
      try {
        const nav = navigator as unknown as Record<string, () => void>;
        nav.clearAppBadge?.();
      } catch {
        /* noop */
      }
    } finally {
      setLoading(false);
    }
  }

  // 개별 알림 읽음 처리 (× 버튼)
  async function dismissOne(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      // 낙관적 업데이트
      setItems((prev) =>
        prev?.map((it) =>
          it.id === id
            ? { ...it, read_at: it.read_at ?? new Date().toISOString() }
            : it,
        ) ?? prev,
      );
      void fetchData();
    } catch {
      /* noop */
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="알림"
        title="알림"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="relative flex items-center gap-1.5 rounded-md p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-label={`미확인 알림 ${unread}개`}
            // HOT 라벨과 동일 핑크 (#F48FB1) — 옛 새빨간색 대비 톤앤매너 일관성
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
            style={{ backgroundColor: "#F48FB1" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          // position: fixed → wrapper transform/overflow 영향 무관, viewport 기준.
          // 카카오/네이버 인앱에서 absolute 가 viewport 좌측 너머로 잘리는 현상 회피.
          className="fixed z-50 overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg"
          style={{
            top: dropTop,
            right: 8,
            // 폭: 320px 기본, 단 viewport 기준 좌우 16px 여백 보장. iOS Safari 좁은 화면 대응.
            width: "min(320px, calc(100vw - 16px))",
            // iOS Safari 자동 텍스트 확대 방지 (가독성 위해 100% 고정)
            WebkitTextSizeAdjust: "100%",
            textSizeAdjust: "100%",
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="text-sm font-bold text-[var(--text)]">알림</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {loading ? "동기화 중…" : items ? `${items.length}건` : ""}
            </span>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {!items || items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                받은 알림이 없습니다.
              </li>
            ) : (
              items.map((it) => (
                <li
                  key={it.id}
                  className="group relative border-b border-[var(--border)]/60 last:border-b-0"
                >
                  <Link
                    href={it.url}
                    onClick={() => setOpen(false)}
                    className={
                      "block px-3 py-2 pr-8 text-[12px] hover:bg-[var(--bg-soft)] " +
                      (it.read_at
                        ? "text-[var(--text-secondary)]"
                        : "bg-[var(--primary)]/5 text-[var(--text)]")
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {KIND_LABELS[it.kind] ?? "알림"}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                        {timeAgo(it.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 leading-snug">
                      {it.message}
                    </p>
                  </Link>
                  {/* 개별 × 버튼 — 읽음으로 표시 (모바일 터치 위해 항상 노출, hover 시 진해짐) */}
                  {!it.read_at && (
                    <button
                      type="button"
                      onClick={(e) => dismissOne(it.id, e)}
                      aria-label="이 알림 읽음 처리"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-50 hover:bg-[var(--bg-soft)] hover:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
          {/* 하단 진입점 — 전체 보기 + 알림 설정 */}
          <div className="flex border-t border-[var(--border)] text-[11px]">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex-1 px-3 py-2 text-center text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
            >
              전체 보기
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex-1 border-l border-[var(--border)] px-3 py-2 text-center text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
            >
              ⚙ 설정
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_LABELS: Record<NotificationItem["kind"], string> = {
  comment: "💬 댓글",
  reply: "↳ 답글",
  like: "❤ 좋아요",
  new_ask: "❓ 새 궁금해요",
  review_request: "🩺 검수 요청",
  published: "🚀 발행됨",
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function BellIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

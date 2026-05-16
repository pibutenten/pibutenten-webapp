"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * 우상단 종 아이콘 + 미확인 배지.
 *
 * - 60초마다 unread count 폴링
 * - PWA Badge API (navigator.setAppBadge) — 홈 아이콘 위 숫자 (지원 OS만)
 * - 클릭 시 /notifications 페이지로 이동 (이전: dropdown popup)
 * - 알림 페이지에서 읽음 처리 시 `pibutenten:notifications-read` 이벤트 emit → 여기서 unread 동기화
 */

const POLL_MS = 60_000;

export default function NotificationsBell() {
  const [unread, setUnread] = useState(0);

  // AbortController로 in-flight fetch 취소 + unmount/탭 숨김 시 정리.
  // unread count 만 필요하므로 limit=1 — 응답 페이로드 최소화.
  const fetchUnread = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/notifications?limit=1", {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number };
      if (signal?.aborted) return;
      setUnread(data.unread);
      // PWA Badge API (지원 안 하면 silent fail)
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
      /* abort 또는 네트워크 에러 — silent */
    }
  }, []);

  // 초기 fetch + polling — 탭이 hidden일 때는 폴링 skip (배터리/네트워크 절약)
  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUnread(ac.signal);
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchUnread(ac.signal);
    }, POLL_MS);
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [fetchUnread]);

  // 탭 복귀 시 즉시 refetch
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") void fetchUnread();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchUnread]);

  // /notifications 페이지가 읽음 처리 시 emit → 배지 동기화
  useEffect(() => {
    function onRead() {
      void fetchUnread();
    }
    window.addEventListener("pibutenten:notifications-read", onRead);
    return () => window.removeEventListener("pibutenten:notifications-read", onRead);
  }, [fetchUnread]);

  return (
    <Link
      href="/notifications"
      aria-label="알림"
      title="알림"
      className="relative flex items-center gap-1.5 rounded-md p-2 text-[var(--text)] transition-colors hover:text-[var(--primary)]"
    >
      <BellIcon />
      {unread > 0 && (
        <span
          aria-label={`미확인 알림 ${unread}개`}
          // HOT 라벨과 동일 핑크 (#F48FB1) — 톤앤매너 일관성
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-white"
          style={{ backgroundColor: "#F48FB1" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
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

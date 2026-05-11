"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 인스타식 알림 배지 — 헤더 아바타 우상단에 절대 위치.
 *
 *  - 미읽 알림 개수 fetch (RPC: get_unread_notifications_count)
 *  - 1+ 일 때만 표시
 *  - 9까지는 숫자, 10+ 는 "9+"로 압축
 *  - 60초마다 폴링 (단순 — websocket 대신)
 *  - "pibutenten:notifications-read" 이벤트 받으면 즉시 refetch
 */
const POLL_MS = 60_000;

export default function NotificationBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.rpc("get_unread_notifications_count");
        if (cancelled) return;
        const n = typeof data === "number" ? data : 0;
        setCount(n);
      } catch {
        // 로그인 안 됨 등 — 0 유지
      }
    }
    load();
    timer = setInterval(load, POLL_MS);

    function onRead() {
      load();
    }
    window.addEventListener("pibutenten:notifications-read", onRead);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("pibutenten:notifications-read", onRead);
    };
  }, []);

  if (count <= 0) return null;

  const label = count > 9 ? "9+" : String(count);
  return (
    <Link
      href="/notifications"
      onClick={(e) => e.stopPropagation()}
      aria-label={`미읽 알림 ${count}개 — 알림 보기`}
      className="absolute -right-1 -top-1 z-10 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-[3px] text-[10px] font-bold leading-none text-white ring-2 ring-white transition-transform hover:scale-110"
    >
      {label}
    </Link>
  );
}

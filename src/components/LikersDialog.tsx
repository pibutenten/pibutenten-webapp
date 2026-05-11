"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Liker = {
  user_id: string;
  persona: "official" | "personal" | string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  created_at: string;
};

type Props = {
  qaId: number;
  open: boolean;
  onClose: () => void;
};

/**
 * 인스타식 좋아요 리스트 다이얼로그.
 * - "N명이 좋아합니다"의 N명 클릭 시 열림
 * - 좋아요한 사람 전체 리스트 (최대 200명)
 * - 각 항목 클릭 시 그 사람 프로필로 이동
 *
 * 닫기: 우상단 X · 외부 클릭 · ESC 키
 */
const FETCH_LIMIT = 200;

export default function LikersDialog({ qaId, open, onClose }: Props) {
  const [likers, setLikers] = useState<Liker[] | null>(null);
  const [loading, setLoading] = useState(false);

  // open 시 fetch
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data } = await sb.rpc("get_recent_likers", {
          p_qa_id: qaId,
          p_limit: FETCH_LIMIT,
        });
        if (cancelled) return;
        setLikers((data ?? []) as Liker[]);
      } catch {
        if (!cancelled) setLikers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaId, open]);

  // ESC 키 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="좋아요"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      onClick={(e) => {
        // 외부(backdrop) 클릭 시 닫기
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" aria-hidden />

      {/* Bottom sheet (모바일) / Centered modal (데스크탑). 인스타 표준.
          모바일은 화면 전체 너비 + slideUp 애니메이션으로 바닥에서 올라오는 느낌. */}
      <div className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[var(--shadow-lg)] animate-[likersSlideUp_280ms_cubic-bezier(0.16,1,0.3,1)] sm:max-w-[400px] sm:rounded-[var(--radius)] sm:animate-none">
        {/* 드래그 핸들 — 모바일만 (인스타식) */}
        <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden">
          <span
            className="h-1 w-10 rounded-full bg-[var(--border)]"
            aria-hidden
          />
        </div>
        {/* Header — 항상 위에 고정 */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">
            좋아요
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[20px] w-[20px]"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body — 남는 공간 차지하며 내부 스크롤 */}
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && !likers && (
            <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              불러오는 중…
            </li>
          )}
          {likers && likers.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              아직 좋아요가 없어요.
            </li>
          )}
          {likers?.map((l) => (
            <LikerRow key={l.user_id} liker={l} onClose={onClose} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LikerRow({ liker, onClose }: { liker: Liker; onClose: () => void }) {
  const name = liker.display_name ?? "익명";
  const initial = name.slice(0, 1);
  const href = liker.handle ? `/${liker.handle}` : null;

  const content = (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-soft)]">
      {liker.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={liker.avatar_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg-soft)] object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[14px] font-semibold text-[var(--text-secondary)]">
          {initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-[var(--text)]">
          {name}
        </div>
        {liker.handle && (
          <div className="truncate text-[12px] text-[var(--text-muted)]">
            @{liker.handle}
          </div>
        )}
      </div>
    </div>
  );

  if (!href) {
    return <li>{content}</li>;
  }
  return (
    <li>
      <Link href={href} onClick={onClose} className="block">
        {content}
      </Link>
    </li>
  );
}

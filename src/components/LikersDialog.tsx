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

        {/* Body — 컴팩트 그리드 (한 줄 2명, 데스크탑 3명).
            아바타 + 닉네임만 — handle/id 표시 X (팔로우 시스템 아니라 간소화) */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {loading && !likers && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              불러오는 중…
            </p>
          )}
          {likers && likers.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              아직 좋아요가 없어요.
            </p>
          )}
          {likers && likers.length > 0 && (
            <ul className="flex flex-wrap gap-x-1 gap-y-1">
              {likers.map((l) => (
                <LikerRow key={l.user_id} liker={l} onClose={onClose} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function LikerRow({ liker, onClose }: { liker: Liker; onClose: () => void }) {
  const name = liker.display_name ?? "익명";
  const initial = name.slice(0, 1);
  const href = liker.handle ? `/${liker.handle}` : null;

  // 컴팩트 인라인 칩 — 좌측 정렬로 한 줄에 여러 명 wrap. 아바타 + 닉네임만.
  const content = (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-soft)] py-1 pl-1 pr-3 transition-colors hover:bg-[var(--primary-soft)]">
      {liker.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={liker.avatar_url}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full bg-white object-cover"
        />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-[var(--text-secondary)]">
          {initial}
        </span>
      )}
      <span className="max-w-[100px] truncate text-[12.5px] font-medium text-[var(--text)]">
        {name}
      </span>
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

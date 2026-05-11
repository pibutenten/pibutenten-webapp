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
  /** 좋아요 카운트. 0이면 컴포넌트 자체 렌더링 X. 변할 때 refetch trigger. */
  likeCount: number;
  /** 최대 노출 아바타 수 (default 3) */
  maxAvatars?: number;
};

/**
 * 인스타식 좋아요 표시.
 *
 *  - 좋아요 1+: 아바타 1~3개 겹쳐서 + "○○○님이 좋아합니다" / "○○○님 외 N명이 좋아합니다"
 *  - 페르소나 분기: qa_likes.persona='personal'이면 alt_display_name·alt_avatar·alt_handle
 *  - lazy load: 좋아요 카운트 > 0일 때만 RPC 호출, 카드 mount 시 한 번
 *
 * 위치: QACard footer 구분선 아래, CommentsBlock 바로 위.
 */
export default function RecentLikers({
  qaId,
  likeCount,
  maxAvatars = 3,
}: Props) {
  const [likers, setLikers] = useState<Liker[] | null>(null);

  useEffect(() => {
    if (likeCount <= 0) {
      setLikers(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const { data, error } = await sb.rpc("get_recent_likers", {
          p_qa_id: qaId,
          p_limit: maxAvatars,
        });
        if (cancelled) return;
        if (error || !data) {
          setLikers([]);
          return;
        }
        setLikers(data as Liker[]);
      } catch {
        if (!cancelled) setLikers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaId, likeCount, maxAvatars]);

  if (likeCount <= 0 || !likers || likers.length === 0) return null;

  const firstName = likers[0]?.display_name ?? "익명";
  const others = Math.max(0, likeCount - 1);

  const visibleLikers = likers.slice(0, maxAvatars);

  return (
    <div className="flex items-center gap-2 py-1 text-[13.5px] text-[var(--text-secondary)]">
      {/* 아바타 겹침 — 더 컴팩트 (-space-x-2.5). 맨 좌측이 z-index 가장 위.
          좌측 정렬은 카드 footer 아이콘(좋아요/댓글)과 동일하게 — padding 없음. */}
      <div className="flex -space-x-2.5">
        {visibleLikers.map((l, idx) => (
          <div
            key={l.user_id}
            className="relative"
            style={{ zIndex: visibleLikers.length - idx }}
          >
            <LikerAvatar liker={l} />
          </div>
        ))}
      </div>

      {/* 텍스트 — 첫 명 강조 + 외 N명 */}
      <span className="leading-tight">
        <LikerName liker={likers[0]} fallback={firstName} />
        {others > 0 ? (
          <>
            {" "}
            님 외{" "}
            <strong className="font-semibold text-[var(--text)]">
              {others}명
            </strong>
            이 좋아합니다
          </>
        ) : (
          <> 님이 좋아합니다</>
        )}
      </span>
    </div>
  );
}

function LikerAvatar({ liker }: { liker: Liker }) {
  const initial = (liker.display_name ?? "?").slice(0, 1);
  const href = liker.handle ? `/${liker.handle}` : null;
  const inner = liker.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={liker.avatar_url}
      alt={liker.display_name ?? "회원"}
      className="h-7 w-7 rounded-full border-2 border-white bg-[var(--bg-soft)] object-cover"
    />
  ) : (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--bg-soft)] text-[10px] font-semibold text-[var(--text-secondary)]">
      {initial}
    </span>
  );
  if (!href) return inner;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${liker.display_name ?? "회원"} 프로필`}
      className="transition-transform hover:scale-110"
    >
      {inner}
    </Link>
  );
}

function LikerName({
  liker,
  fallback,
}: {
  liker: Liker | undefined;
  fallback: string;
}) {
  const name = liker?.display_name ?? fallback;
  const href = liker?.handle ? `/${liker.handle}` : null;
  if (!href) {
    return (
      <strong className="font-semibold text-[var(--text)]">{name}</strong>
    );
  }
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="font-semibold text-[var(--text)] hover:underline"
    >
      {name}
    </Link>
  );
}

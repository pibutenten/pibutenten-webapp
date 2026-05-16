"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchRecentLikersBatch } from "@/lib/likers-batch";
import LikersDialog from "@/components/LikersDialog";

type Liker = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  created_at: string;
};

type Props = {
  cardId: number;
  /** 좋아요 카운트. 0이면 컴포넌트 자체 렌더링 X. 변할 때 refetch trigger. */
  likeCount: number;
  /** 최대 노출 아바타 수 (default 3) */
  maxAvatars?: number;
};

/**
 * 인스타식 좋아요 표시.
 *
 *  - "○○○님이 좋아합니다" / "○○○님 외 N명이 좋아합니다"
 *  - lazy load: 카운트 > 0일 때만 RPC 호출, 카드 mount 시 한 번
 *
 * 위치: Card footer 구분선 아래, CommentsBlock 바로 위.
 */
export default function RecentLikers({
  cardId,
  likeCount,
  maxAvatars = 3,
}: Props) {
  const [likers, setLikers] = useState<Liker[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (likeCount <= 0) {
      setLikers(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchRecentLikersBatch(cardId, maxAvatars);
        if (cancelled) return;
        setLikers(rows as Liker[]);
      } catch {
        if (!cancelled) setLikers([]);
      }
    }
    // 즉시 한 번 + 좋아요 INSERT 반영 위해 500ms 후 한 번 더 (idempotent refetch).
    // 각 호출은 모듈 큐가 80ms 디바운스로 모아 1회 batch RPC 로 전송 — 카드 N장이면 최대 2회 RPC.
    load();
    const t = setTimeout(load, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cardId, likeCount, maxAvatars]);

  if (likeCount <= 0 || !likers || likers.length === 0) return null;

  const firstName = likers[0]?.display_name ?? "익명";
  const others = Math.max(0, likeCount - 1);

  const visibleLikers = likers.slice(0, maxAvatars);

  const tailMany = "이 좋아합니다";
  const tailOne = "님이 좋아합니다";

  return (
    <div className="flex items-center gap-2 mt-2 py-1 text-[13.5px] text-[var(--text-secondary)]">
      {/* 아바타 겹침 — 더 컴팩트 (-space-x-3.5). 맨 좌측이 z-index 가장 위.
          좌측 정렬은 footer 아이콘(좋아요/추천)과 시각적으로 동일 시작 위치 — 음수 마진 -2px 보정.
          (avatar는 border-2 흰색 외곽선 때문에 실제 이미지가 2px 안쪽에서 시작) */}
      <div className="flex -space-x-3.5 -ml-[2px]">
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

      {/* 텍스트 — 첫 명 강조 + "외 N명" 클릭 시 다이얼로그 (인스타식)
          닉네임과 "님" 사이 공백 없음 (배스킨님 외 1명…) */}
      <span className="leading-tight">
        <LikerName liker={likers[0]} fallback={firstName} />
        {others > 0 ? (
          <>
            님 외{" "}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDialogOpen(true);
              }}
              className="font-semibold text-[var(--text)] underline-offset-2 hover:underline"
            >
              {others}명
            </button>
            {tailMany}
          </>
        ) : (
          <>{tailOne}</>
        )}
      </span>

      {/* 인스타식 리스트 다이얼로그 */}
      <LikersDialog
        cardId={cardId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

/**
 * supabase storage URL 에 transformation query 만 추가 (path 는 유지).
 *  - 정적 자산(/doctors/*.png)·외부 호스팅: 그대로 반환
 *  - supabase /storage/v1/object/...: ?width=&height= query 추가
 *      (Free 플랜은 query 무시하여 원본 그대로 — regression 0)
 *      (Pro 플랜에 image transformation 활성화 시 thumb 변환 적용)
 *  path 자체를 /render/image/ 로 바꾸면 Free 에서 404 가능 — 위험 회피.
 */
function withImageTransform(url: string, size: number): string {
  if (!url) return url;
  if (!url.includes("/storage/v1/object/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}width=${size}&height=${size}&resize=cover`;
}

function LikerAvatar({ liker }: { liker: Liker }) {
  const initial = (liker.display_name ?? "?").slice(0, 1);
  const href = liker.handle ? `/${liker.handle}` : null;
  // 사진 있는 / 없는 아바타가 동일 박스 크기 — block + shrink-0로 inline-baseline 차이 제거
  const avatarBox =
    "block h-7 w-7 shrink-0 rounded-full border-2 border-white bg-[var(--bg-soft)]";
  const inner = liker.avatar_url ? (
    // 28px(h-7 w-7) 표시 — DPR 2x 대응으로 56px transform 요청.
    // supabase storage 호스팅 이미지면 transform query 가 적용 (Pro 플랜 시),
    // 정적 자산(/doctors/*.png)·외부 URL은 query 무시되어 원본 반환.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withImageTransform(liker.avatar_url, 56)}
      alt={liker.display_name ?? "회원"}
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      className={avatarBox + " object-cover"}
    />
  ) : (
    <span
      className={
        avatarBox +
        " flex items-center justify-center text-[11px] font-semibold text-[var(--text-secondary)]"
      }
    >
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

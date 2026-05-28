"use client";

/**
 * 카드 미디어 — 영상 / 외부 링크 액션 라인 (Phase 4-7 추출).
 *
 * 우선순위:
 *  1) Q&A 카테고리 + external_url(youtube) → ▶ 영상 보러가기 + timestamp
 *  2) videos 테이블 join (legacy backfill, timestamp 없음)
 *  3) Q&A 외 카테고리 + external_url → ↗ 더 알아보기
 *
 * (정정 — 2026-05-15: 옛 코드 'card.category === "card"' 는 항상 false 였음.
 *   category enum = 'qa'|'tip'|'diary'|'ask'|'link'. 이로 인해 external_url 분기를
 *   못 타고 videos.youtube_url(timestamp 없음)으로 fallback 되어 모든 Q&A 영상의
 *   시작 시간이 표시되지 않던 회귀 fix.)
 */
import type { CardData } from "@/components/Card";
import {
  parseYoutubeTimestamp,
  formatTimestamp,
} from "@/lib/youtube-time";

type Props = {
  card: CardData;
  /** 영상 보러가기 클릭 시 호출 — 의도 신호이므로 조회수 +1 트리거. */
  onWatchClick?: () => void;
};

/**
 * YouTube URL 호스트 매칭 정규식 (2026-05-28 모듈 상수화).
 *
 * `youtu.be` (short), `youtube.com` (canonical), `youtube-nocookie.com` (embed privacy) 의
 * 세 가지 도메인을 모두 인정. 매 렌더마다 정규식 재컴파일 방지를 위해 모듈 스코프 상수.
 *
 * 같은 패턴의 정규식이 다른 곳에 또 등장하면 본 상수를 import 해서 재사용 권장.
 */
const YOUTUBE_HOST_RE = /(?:youtu\.be|youtube\.com|youtube-nocookie\.com)/;

export default function CardMedia({ card, onWatchClick }: Props) {
  const isQa = card.category === "qa";
  const ext = card.external_url;
  const isYoutubeExt = !!ext && YOUTUBE_HOST_RE.test(ext);
  const videoHref =
    isQa && isYoutubeExt ? ext : (card.video?.youtube_url ?? null);
  const tsec = parseYoutubeTimestamp(videoHref);

  if (videoHref) {
    return (
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        <a
          href={videoHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            // 영상 보러가기 클릭 = 조회수 +1 (recordView가 session dedup + trigger)
            onWatchClick?.();
          }}
          // 좌측 padding 제거 — 유튜브 아이콘 시작점이 본문 시작점과 일치하도록 (사용자 요청)
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md py-0.5 font-medium transition-colors hover:bg-[var(--bg-soft)]/60"
          style={{ color: "#474B4C" }}
        >
          {/* 유튜브 심볼 — youtube.svg 1:1 사용 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/youtube.svg"
            alt=""
            width={17}
            height={12}
            className="h-3 w-auto"
            aria-hidden
          />
          영상 보러가기
          {tsec !== null && (
            <span className="text-[11px]" style={{ color: "#474B4C" }}>
              {formatTimestamp(tsec)}~
            </span>
          )}
        </a>
      </div>
    );
  }

  // Q&A 외 카테고리 + external_url (영상 아님) → [더 알아보기]
  if (!isQa && ext) {
    return (
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        <a
          href={ext}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary-light-hover)]"
        >
          <span aria-hidden>↗</span> 더 알아보기
        </a>
      </div>
    );
  }

  return null;
}

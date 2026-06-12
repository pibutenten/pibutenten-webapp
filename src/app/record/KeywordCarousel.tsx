"use client";

import Link from "next/link";
import { useRef, useState } from "react";

/** 관심 키워드 새 글(컴팩트) — 피드 풀카드와 분리된 전용 카드. */
export type KeywordPost = {
  id: number;
  title: string;
  type: string; // cards.category (현재 qa 전용)
  authorName: string;
  avatarUrl: string | null;
  isNew: boolean;
  timeAgo: string;
  keyword: string; // 매칭된 관심 키워드
  href: string;
};

const CARD_W = 272;
const GAP = 11;
const STEP = CARD_W + GAP;

const TYPE_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  qa: { label: "Q&A", bg: "var(--primary-soft)", fg: "var(--primary-active)" },
  review: { label: "시술후기", bg: "#FEEDF3", fg: "#F76D9B" },
  doodle: { label: "끄적끄적", bg: "var(--bg-soft)", fg: "var(--text-secondary)" },
  review_summary: { label: "리포트", bg: "var(--primary-soft)", fg: "var(--primary-active)" },
};

export default function KeywordCarousel({
  posts,
  myKeywords,
  viewAllHref,
}: {
  posts: KeywordPost[];
  myKeywords: string[];
  viewAllHref: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const dotCount = posts.length + 1; // 글 카드 + 전체보기 CTA

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setActive(Math.min(Math.max(Math.round(el.scrollLeft / STEP), 0), dotCount - 1));
  };
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * STEP, behavior: "smooth" });

  return (
    <div className="group/kw relative">
      {/* 키워드 칩 — 한 줄 가로 스크롤(해시태그 표기 없음) */}
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {myKeywords.slice(0, 12).map((k) => (
          <span key={k} className="shrink-0 whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-[13.5px] font-bold text-[var(--primary-active)]">{k}</span>
        ))}
        <Link href="/settings/profile" className="shrink-0 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#C5DFEF] bg-white px-3 py-1.5 text-[13.5px] font-bold text-[var(--text-muted)]">
          ＋ 키워드 편집
        </Link>
      </div>

      {/* 카러셀 */}
      <div ref={ref} onScroll={onScroll} className="no-scrollbar -mx-0.5 flex gap-[11px] overflow-x-auto px-0.5 pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {posts.map((p) => {
          const chip = TYPE_CHIP[p.type] ?? TYPE_CHIP.qa;
          return (
            <Link
              key={p.id}
              href={p.href}
              className="flex shrink-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[0_2px_10px_rgba(34,43,53,.05)] transition-colors hover:border-[var(--primary)]"
              style={{ width: CARD_W, scrollSnapAlign: "start" }}
            >
              <div className="flex items-center gap-1.5">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatarUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px]" style={{ background: "linear-gradient(135deg,#DCEFF9,#BFE4F6)" }}>{p.authorName.slice(0, 1)}</span>
                )}
                <span className="truncate text-[13px] font-bold text-[var(--text)]">{p.authorName}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                {p.isNew && <span className="ml-auto shrink-0 rounded-full bg-[#F76D9B] px-1.5 py-0.5 text-[10px] font-extrabold text-white">NEW</span>}
              </div>
              <h3 className="mt-2.5 line-clamp-2 min-h-[43px] text-[15px] font-extrabold leading-snug tracking-tight text-[var(--text)]">{p.title}</h3>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {p.keyword ? (
                  <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--primary-active)]">{p.keyword}</span>
                ) : (
                  <span />
                )}
                <span className="shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">{p.timeAgo}</span>
              </div>
            </Link>
          );
        })}
        {/* 전체보기 CTA 카드 */}
        <Link
          href={viewAllHref}
          className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-[1.5px] border-dashed border-[#B9E2F7] bg-[var(--primary-soft)] p-4 text-center"
          style={{ width: 140, scrollSnapAlign: "start" }}
        >
          <span className="text-[24px] text-[var(--primary-active)]">＋</span>
          <span className="text-[13.5px] font-extrabold leading-snug text-[var(--primary-active)]">새 글<br />전체보기</span>
        </Link>
      </div>

      {/* 페이지 도트 */}
      <div className="mt-1.5 flex justify-center gap-[5px]">
        {Array.from({ length: dotCount }, (_, i) => (
          <span key={i} className="h-[6px] rounded-full transition-all" style={i === active ? { width: 16, background: "var(--primary)" } : { width: 6, background: "#CFDDE8" }} />
        ))}
      </div>

      {/* 데스크탑 좌우 화살표 (호버 시 노출) */}
      <button type="button" aria-label="이전" onClick={() => nudge(-1)} className="absolute left-[-6px] top-[52%] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] opacity-0 shadow-md transition-opacity group-hover/kw:opacity-100 sm:flex">‹</button>
      <button type="button" aria-label="다음" onClick={() => nudge(1)} className="absolute right-[-6px] top-[52%] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--text-secondary)] opacity-0 shadow-md transition-opacity group-hover/kw:opacity-100 sm:flex">›</button>
    </div>
  );
}

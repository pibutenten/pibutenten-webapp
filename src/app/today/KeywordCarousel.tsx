"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CardAvatar from "@/components/card/CardAvatar";
import { categorize } from "@/lib/category-sets";
import { CATEGORIES } from "@/lib/categories";
import { shortLabelForCategory } from "@/lib/post-category";

/** 관심 키워드 새 글(컴팩트) — 피드 풀카드와 분리된 전용 카드. */
export type KeywordPost = {
  id: number;
  title: string;
  type: string; // cards.category (현재 qa 전용)
  authorName: string;
  doctorSlug: string | null; // 원장 글이면 slug(피드와 동일 아바타 보정)
  avatarUrl: string | null; // 회원 글 아바타
  isNew: boolean;
  timeAgo: string;
  keyword: string; // 대표(표시용) 매칭 키워드
  matchedKeywords: string[]; // 칩 필터용 — 이 글이 매칭한 모든 키워드
  href: string;
};

// 키워드 → 카테고리 색(피드 카드와 동일 SSOT: categorize + CATEGORIES). 항상 hex.
const kwColor = (k: string) => CATEGORIES.find((c) => c.slug === categorize(k))?.color ?? "#1E9FE0";
// #RRGGBB + 알파(0~1) → #RRGGBBAA (연한 배경 틴트용).
const hexA = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");

const CARD_W = 272;
const GAP = 11;
const STEP = CARD_W + GAP;

const TYPE_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  qa: { label: "Q&A", bg: "var(--primary-soft)", fg: "var(--primary-active)" },
  review: { label: "시술후기", bg: "#FEEDF3", fg: "#F76D9B" },
  doodle: { label: "끄적끄적", bg: "var(--bg-soft)", fg: "var(--text-secondary)" },
  review_summary: { label: shortLabelForCategory("review_summary"), bg: "var(--primary-soft)", fg: "var(--primary-active)" },
};

export default function KeywordCarousel({
  posts,
  myKeywords,
  viewAllHref,
  guest = false,
}: {
  posts: KeywordPost[];
  myKeywords: string[];
  viewAllHref: string;
  guest?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [sel, setSel] = useState<string | null>(null); // 선택된 키워드(단일 토글 필터). null=전체.
  const shown = sel ? posts.filter((p) => p.matchedKeywords.includes(sel)) : posts;
  const dotCount = shown.length + 1; // 글 카드 + 전체보기 CTA
  // 필터 변경 시 캐러셀을 맨 앞으로 — 줄어든 dotCount 와 옛 스크롤 위치(active) 불일치 방지.
  useEffect(() => {
    ref.current?.scrollTo({ left: 0 });
    setActive(0);
  }, [sel]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setActive(Math.min(Math.max(Math.round(el.scrollLeft / STEP), 0), dotCount - 1));
  };
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * STEP, behavior: "smooth" });

  return (
    <div className="group/kw relative">
      {/* 키워드 칩 — 카테고리별 색(피드와 동일). 탭 시 그 키워드 글만, 다시 탭 시 전체. */}
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {myKeywords.slice(0, 12).map((k) => {
          const c = kwColor(k);
          const on = sel === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSel(on ? null : k)}
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13.5px] font-bold transition-colors"
              style={on ? { color: "#fff", background: c } : { color: c, background: hexA(c, 0.12) }}
            >
              {k}
            </button>
          );
        })}
        <Link href={guest ? "/signup" : "/settings/profile"} className="shrink-0 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-[#C5DFEF] bg-white px-3 py-1.5 text-[13.5px] font-bold text-[var(--text-muted)]">
          {guest ? "＋ 내 키워드 만들기" : "＋ 키워드 편집"}
        </Link>
      </div>

      {/* 카러셀 */}
      <div ref={ref} onScroll={onScroll} className="no-scrollbar -mx-0.5 flex gap-[11px] overflow-x-auto px-0.5 pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {shown.length === 0 && (
          <div className="flex shrink-0 items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-4 text-center text-[13px] font-medium text-[var(--text-muted)]" style={{ width: CARD_W, scrollSnapAlign: "start" }}>
            ‘{sel}’ 키워드의 새 글이 아직 없어요.
          </div>
        )}
        {shown.map((p) => {
          const chip = TYPE_CHIP[p.type] ?? TYPE_CHIP.qa;
          return (
            <Link
              key={p.id}
              href={p.href}
              className="flex shrink-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[0_2px_10px_rgba(34,43,53,.05)] transition-colors hover:border-[var(--primary)]"
              style={{ width: CARD_W, scrollSnapAlign: "start" }}
            >
              <div className="flex items-center gap-1.5">
                <CardAvatar doctorSlug={p.doctorSlug} memberAvatarUrl={p.avatarUrl} name={p.authorName} size={30} />
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
        {/* 피드 보러 가기 CTA 카드 */}
        <Link
          href={viewAllHref}
          className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-[1.5px] border-dashed border-[#B9E2F7] bg-[var(--primary-soft)] p-4 text-center"
          style={{ width: 150, scrollSnapAlign: "start" }}
        >
          <span className="text-[22px]">🔎</span>
          <span className="text-[13.5px] font-extrabold leading-snug text-[var(--primary-active)]">피드<br />보러 가기</span>
          <span className="text-[var(--primary-active)]">›</span>
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

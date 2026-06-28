"use client";

/**
 * ReportsIndexSidebar — /reports(시술 리포트 인덱스 개선판) 전용 우측 사이드바.
 *
 * 피드 탭의 FeedSidebar(인기검색어·인기 Q&A·글쓰기 CTA)와는 별개 — 리포트 인덱스 맥락에 맞춘 3박스:
 *   ① 후기 쓰기 CTA      — "내가 받은 시술, 후기 남기기" → /review/new.
 *   ② 후기 많은 시술      — 상위 시술(시술명 + 경험 N건) + 시술 카테고리 6칩(필터 콜백).
 *   ③ 이 리포트는요        — 신뢰·방법 안내 + 전문의 Q&A 얇은 링크(/topics).
 *
 * 격리: app.module.css 클래스 의존 금지 — Tailwind 유틸 + globals.css 토큰(var(--…))만 사용.
 *   (병렬 세션이 app.module.css/FeedSidebar 를 수정 중이라 충돌 회피.)
 */

import Link from "next/link";
import { PROCEDURE_CATEGORIES, type ProcedureSlug } from "@/lib/categories";
import { categoryTheme } from "@/lib/procedure-theme";
import { experienceCount } from "@/lib/report-copy";

// flat — 음영·테두리 없음(우리 UI/UX). 흰 카드는 회색 페이지 배경과 채움 대비로 구분.
const BOX = "rounded-[var(--radius)] bg-white p-4";
const H3 = "text-[15px] font-bold text-[var(--text)]";
// 포커스 링 — globals.css 가 :focus-visible 만 살려두므로 키보드 포커스에서만 보임.
const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-active)]";

/** 선택 카테고리 칩 배경 — 분류색의 진한 틴트(테두리 없이 채움만으로 선택 표시, 다크 텍스트라 AA). */
function tintStrong(color: string): string {
  if (!color.startsWith("#")) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.28)`;
}

export type SidebarTopProcedure = {
  ko: string;
  count: number;
};

export default function ReportsIndexSidebar({
  topProcedures,
  activeCategory,
  onCategory,
}: {
  /** '후기 많은 시술' 목록 — count desc 상위(부모 page 에서 슬라이스). */
  topProcedures: SidebarTopProcedure[];
  /** 현재 선택된 카테고리 슬러그(필터). null=전체. 칩 선택 표시용. */
  activeCategory: ProcedureSlug | null;
  /** 카테고리 칩 클릭 — 부모가 피드 필터. 같은 칩 재클릭=전체 해제는 부모가 처리. */
  onCategory: (slug: ProcedureSlug) => void;
}) {
  return (
    <>
      {/* ① 후기 쓰기 CTA */}
      <section className={BOX + " flex items-center justify-between gap-3"}>
        <div className="min-w-0">
          <h3 className={H3}>내가 받은 시술, 후기 남기기</h3>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            내 경험이 다음 사람의 선택을 도와요.
          </p>
        </div>
        <Link
          href="/review/new"
          style={{ color: "#fff" }}
          className={
            "shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)] " +
            FOCUS_RING
          }
        >
          후기 쓰기
        </Link>
      </section>

      {/* ② 후기 많은 시술 + 카테고리 칩 */}
      <section className={BOX}>
        <h3 className={H3}>후기 많은 시술</h3>
        {topProcedures.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {topProcedures.map((p) => (
              <li key={p.ko}>
                <Link
                  href={`/reports/${encodeURIComponent(p.ko)}`}
                  className={
                    "flex items-baseline justify-between gap-2 rounded-[var(--radius-sm)] px-1 py-1 transition-colors hover:bg-[var(--bg)] " +
                    FOCUS_RING
                  }
                >
                  <span className="truncate text-[13.5px] font-medium text-[var(--text)]">
                    {p.ko}
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                    {experienceCount(p.count)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* 시술 카테고리 6칩 — 글자색은 항상 다크(--text)로 AA 확보, 배경은 분류색 틴트(theme.soft).
            선택 상태는 흰 글씨 대신 ring(theme.color) + font-semibold 로 표시(대비는 다크 텍스트가
            담당, 색은 보조 단서 → 색각 이상 사용자도 선택 칩을 굵기·테두리로 구분). */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {PROCEDURE_CATEGORIES.map((c) => {
            const theme = categoryTheme(c.slug);
            const on = activeCategory === c.slug;
            return (
              <button
                type="button"
                key={c.slug}
                onClick={() => onCategory(c.slug)}
                aria-pressed={on}
                className={
                  "rounded-full px-2.5 py-1 text-[12px] text-[var(--text)] transition-colors " +
                  (on ? "font-bold" : "font-medium") +
                  " " +
                  FOCUS_RING
                }
                style={{ backgroundColor: on ? tintStrong(theme.color) : theme.soft }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ③ 이 리포트는요 — 신뢰/방법 + 전문의 Q&A 얇은 링크 */}
      <section className={BOX}>
        <h3 className={H3}>이 리포트는요</h3>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
          회원들의 실사용 후기를 시술별로 집계한 결과예요. 특정 병원·의료진의 효과
          주장이 아니며, 개인차가 있어요. 시술 결정은 전문의 상담 후에 하세요.
        </p>
        <Link
          href="/topics"
          className="mt-3 flex items-center justify-between gap-2 pt-1 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
        >
          <span>이 시술이 궁금하면 → 전문의 Q&amp;A</span>
          <span aria-hidden className="text-[var(--text-muted)]">
            →
          </span>
        </Link>
      </section>
    </>
  );
}

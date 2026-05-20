"use client";

/**
 * CardKeywords — 카드 하단 태그 칩 (한 줄에 들어가는 만큼 + N 토글).
 *
 * 추출 배경 (2026-05-17):
 *   Card.tsx 의 542줄 중 142줄을 차지하던 인라인 Keywords sub-component 를
 *   card/ 폴더 분리 정책에 맞춰 단독 파일로 추출.
 *
 * 동작:
 *   - SSR HTML 에는 모든 태그 한 번만 등장 (검색엔진 친화)
 *   - 클라이언트 측: 컨테이너 너비 측정 → 첫 줄에 fit 하는 칩 개수만 노출
 *   - 나머지는 "+N" 배지로 표시, 클릭 시 펼침
 *   - forceShowAll: 카드 본문 펼침 / 글 단독 페이지 진입 시 자동 펼침
 */

import { useLayoutEffect, useRef, useState } from "react";

const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] whitespace-nowrap";
const CHIP_DEFAULT_STYLE: React.CSSProperties = {
  backgroundColor: "#F0F2F5",
  color: "#A2A6AF",
  fontWeight: 500,
};

export default function CardKeywords({
  keywords,
  activeQuery,
  queryCategoryColor,
  onPick,
  forceShowAll = false,
}: {
  keywords: string[];
  activeQuery?: string;
  queryCategoryColor: string | null;
  onPick: (kw: string) => void;
  /** 카드 본문 펼침 / 단독 페이지 진입 시 태그도 자동 펼침 */
  forceShowAll?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showAllLocal, setShowAllLocal] = useState(false);
  const showAll = forceShowAll || showAllLocal;
  const setShowAll = setShowAllLocal;
  // 초기값: 모든 태그 노출(SSR HTML에는 한 번만 등장).
  // 클라이언트에서 첫 줄 측정 후 fitCount 조정 → +N 배지 표시.
  const [fitCount, setFitCount] = useState<number>(keywords.length);

  // 측정: DOM에 detached probe div를 잠깐 만들어 첫 줄에 맞는 칩 갯수 계산.
  //  → 별도 측정 div를 마크업에 두지 않음 (검색엔진/AI 태그 스터핑 방지)
  useLayoutEffect(() => {
    if (showAll) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof document === "undefined") return;

    const measure = () => {
      const w = wrapper.clientWidth;
      if (w === 0) return;
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:absolute;left:-99999px;top:-99999px;width:${w}px;display:flex;flex-wrap:wrap;gap:4px;visibility:hidden;`;
      for (const kw of keywords) {
        const span = document.createElement("span");
        span.className = CHIP_BASE_CLASS;
        span.style.backgroundColor = "#F0F2F5";
        span.style.color = "#A2A6AF";
        span.style.fontWeight = "500";
        span.textContent = kw;
        probe.appendChild(span);
      }
      document.body.appendChild(probe);
      const chips = Array.from(probe.children) as HTMLElement[];
      let count = chips.length;
      if (chips.length > 0) {
        const firstTop = chips[0].offsetTop;
        for (let i = 1; i < chips.length; i++) {
          if (chips[i].offsetTop > firstTop + 2) {
            count = Math.max(0, i - 1); // +N 배지 자리 확보
            break;
          }
        }
      }
      document.body.removeChild(probe);
      setFitCount(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [keywords, showAll]);

  const visible = showAll ? keywords : keywords.slice(0, fitCount);
  const hidden = keywords.length - visible.length;

  return (
    <div ref={wrapperRef} className="relative mb-2 mt-2.5">
      {/* 스크린리더 + LLM/검색엔진용 텍스트 — 콤마 구분으로 단어 경계 명시 (D-4) */}
      <span className="sr-only">태그: {keywords.join(", ")}</span>
      {/* 실제 노출 — collapse 상태일 때 한 줄, 펼친 상태일 때만 wrap */}
      <div
        aria-hidden="true"
        className={
          "flex gap-1 py-px " +
          (showAll ? "flex-wrap" : "flex-nowrap overflow-x-hidden")
        }
      >
        {visible.map((kw) => {
          const matched = activeQuery && kw === activeQuery;
          return (
            <button
              key={kw}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(kw);
              }}
              className={
                CHIP_BASE_CLASS +
                " cursor-pointer transition-colors hover:shadow-sm"
              }
              style={
                matched && queryCategoryColor
                  ? {
                      backgroundColor: queryCategoryColor + "1A",
                      borderColor: queryCategoryColor,
                      color: queryCategoryColor,
                      fontWeight: 700,
                    }
                  : CHIP_DEFAULT_STYLE
              }
            >
              {kw}
            </button>
          );
        })}
        {!showAll && hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ backgroundColor: "#F0F2F5", color: "#A2A6AF" }}
          >
            +{hidden}
          </button>
        )}
        {showAll && keywords.length > 0 && !forceShowAll && (
          /* "접기" 는 태그가 아니므로 칩 디자인 X — 연한 회색 inline 텍스트 (본문 더보기와 동일 톤).
             6번 — forceShowAll(글 단독 페이지) 일 때는 접기 자체 미노출 (사용자 요청). */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(false);
            }}
            className="inline-flex cursor-pointer items-center whitespace-nowrap px-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}

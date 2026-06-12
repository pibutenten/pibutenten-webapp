"use client";

import { useRef, type ReactNode } from "react";

/**
 * 가로 캐러셀 — 모바일 터치 스와이프(네이티브) + 데스크탑 마우스 드래그-투-스크롤.
 *   스크롤바는 숨기되(.no-scrollbar) 스크롤 기능은 유지. 카드가 살짝 보여(peek) 넘김 유도.
 *   드래그로 이동한 경우 자식 링크/버튼의 클릭을 막아 의도치 않은 이동 방지.
 */
export default function Carousel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  const onDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { down: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false };
  };
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !drag.current.down) return;
    const dx = e.pageX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const stop = () => {
    drag.current.down = false;
  };
  // 드래그 직후의 click 은 취소(링크 이동·버튼 클릭 방지).
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div
      ref={ref}
      className={"no-scrollbar flex gap-3 overflow-x-auto select-none " + className}
      style={{ scrollSnapType: "x mandatory", cursor: "grab" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={stop}
      onMouseLeave={stop}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}

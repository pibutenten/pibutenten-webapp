"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

/**
 * 검색창 + 타이틀.
 * - 모바일 focus 시 H1 collapse (opacity/maxHeight transition)
 * - SearchBar 부분은 sticky로 스크롤해도 항상 상단에 고정
 *   (TopNav 56px 아래 — top-[56px])
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);

  function handleFocusChange(f: boolean) {
    setFocused(f);
  }

  return (
    <header className="text-center pt-6 sm:pt-10">
      <h1
        className="overflow-hidden font-extrabold text-[var(--primary)] transition-[opacity,max-height,margin] duration-300"
        style={{
          fontSize: "clamp(26px, 6vw, 32px)",
          letterSpacing: "-0.8px",
          opacity: focused ? 0 : 1,
          maxHeight: focused ? 0 : "120px",
          marginBottom: focused ? 0 : "24px",
          pointerEvents: focused ? "none" : "auto",
        }}
      >
        피부가 예뻐지는 모든 이야기
      </h1>
      {/* 검색창 — 스크롤해도 상단 고정 (TopNav 56px 아래)
          ※ 부모 main 영역의 좌우 패딩(px-4 sm:px-6)을 음수 마진으로 상쇄해서
             배경이 화면 끝까지 차도록 처리 */}
      <div
        className="sticky top-[56px] z-30 -mx-4 px-4 py-2 sm:-mx-6 sm:px-6"
        style={{
          backgroundColor: "var(--bg)",
          boxShadow: "0 2px 4px -2px rgba(0,0,0,0.06)",
        }}
      >
        <SearchBar
          initialValue={initialQ}
          onFocusChange={handleFocusChange}
          autoFocusOnDesktop={!initialQ}
        />
      </div>
    </header>
  );
}

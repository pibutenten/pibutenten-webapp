"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

/** 페이지 진입마다 랜덤하게 표시될 카피 20개 */
const HERO_PHRASES = [
  "오늘 나의 피부 고민은?",
  "지금 가장 궁금한 피부 이야기",
  "피부, 어디서 시작할까요?",
  "당신의 피부에 답이 있어요",
  "피부 미용, 솔직하게 알아볼까요?",
  "전문의가 알려주는 진짜 피부 이야기",
  "피부 고민, 이제 검색하세요",
  "오늘은 어떤 피부 이야기?",
  "피부가 예뻐지는 모든 이야기",
  "당신의 피부, 정답을 찾을 시간",
  "피부 미용, 더 똑똑하게",
  "원장님이 직접 답하는 피부 Q&A",
  "내 피부에 꼭 맞는 답을 찾아요",
  "어제보다 더 예쁜 오늘의 피부",
  "피부 트렌드, 가장 먼저 만나요",
  "피부 고민 1분이면 끝",
  "지금 인기있는 피부 시술은?",
  "피부 미용의 모든 것",
  "오늘도 피부 텐텐!",
  "전문의의 진짜 정보, 피부텐텐",
];

/**
 * 검색창 + 타이틀.
 * - SSR 시 첫 phrase로 렌더 (hydration mismatch 방지)
 * - 마운트 후 useEffect에서 랜덤으로 교체
 * - 모바일 focus 시 H1 collapse
 * - SearchBar는 sticky (TopNav 56px 아래)
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const [phrase, setPhrase] = useState(HERO_PHRASES[0]);

  useEffect(() => {
    // 마운트 시 1회 랜덤 픽 (세션 동안 유지, 새로고침 시 새 phrase)
    setPhrase(HERO_PHRASES[Math.floor(Math.random() * HERO_PHRASES.length)]);
  }, []);

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
        {phrase}
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

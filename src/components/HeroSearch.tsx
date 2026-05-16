"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

/** 페이지 진입마다 랜덤하게 표시될 카피 (모든 피부 고민, 바로가기를 강조) */
const HERO_PHRASES = [
  "오늘 나의 피부 고민은?",
  "지금 가장 궁금한 피부소식",
  "피부가 건조한 날, 찾아보세요",
  "피부가 민감한 날, 찾아보세요",
  "나에게 맞는 피부 루틴 찾기",
  "솔직한 피부 이야기 바로가기",
  "모든 피부 고민, 바로가기",
  "지금 알고싶은 피부 이야기",
  "전문의와 함께하는 피부 일상",
  "복합성 피부 꿀팁 찾아보기",
  "지금 내 피부에 필요한 것 찾기",
  "내 피부 고민, 같은 사람 찾기",
  "오늘의 피부 트렌드는?",
  "지금 인기있는 피부 시술은?",
  "전문의만 아는 진짜 피부 이야기",
  "피부과 전문의의 진짜 해답",
  "시술 전에 꼭 알아야 할 것들",
  "전문의가 직접 답하는 Q&A",
  "내 피부 타입에 맞는 정보 찾기",
  "전문의가 말하는 진짜 피부 관리",
  "요즘 가장 핫한 시술 알아보기",
  "강남에서 요즘 뜨는 시술은?",
  "강남에서 핫한 시술 알아보기",
  "40대가 많이 받는 시술 이야기",
  "요즘 30대의 피부 관심사는?",
  "가장 핫한 팔자주름 시술은?",
  "목주름에 진짜 효과있는 방법은?",
  "예쁜 손 만드는 피부 꿀팁은?",
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

  // 6 초 인터벌로 자동 회전 (Fisher-Yates 셔플 큐):
  // - 모든 phrase 한 번씩 노출하고 큐 소진 시 재셔플 → "같은 순서" 인상 제거
  // - 첫 phrase 는 SSR 안전상 HERO_PHRASES[0] 로 마운트 (hydration mismatch 차단),
  //   마운트 직후 첫 pickNext() 호출에서 셔플된 큐로 즉시 교체.
  useEffect(() => {
    function shuffle<T>(arr: T[]): T[] {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    let queue: string[] = shuffle(HERO_PHRASES);
    let prev = HERO_PHRASES[0];
    function pickNext() {
      if (queue.length === 0) {
        queue = shuffle(HERO_PHRASES);
        // 새 큐 첫 항목이 직전과 같으면 한 번 swap (연속 노출 방지)
        if (queue.length > 1 && queue[0] === prev) {
          [queue[0], queue[1]] = [queue[1], queue[0]];
        }
      }
      const next = queue.shift()!;
      prev = next;
      setPhrase(next);
    }
    pickNext();
    // 5.5초 인터벌 — 4초는 너무 빠르다는 피드백, 6초보단 약간 짧게.
    const timer = window.setInterval(pickNext, 5500);
    return () => window.clearInterval(timer);
  }, []);

  function handleFocusChange(f: boolean) {
    // h1 collapse는 모바일에서만 (키보드 올라올 때 공간 확보용).
    // 데스크탑에선 키보드도 없고 collapse가 페이지 점프처럼 보여서 막는다.
    if (typeof window !== "undefined" && window.innerWidth > 768) {
      setFocused(false);
      return;
    }
    setFocused(f);
  }

  return (
    <header className="text-center pt-6 sm:pt-10">
      <h1
        className="overflow-hidden whitespace-nowrap font-extrabold text-[var(--primary)] transition-[opacity,max-height,margin] duration-300"
        style={{
          fontSize: "clamp(26px, 6vw, 32px)",
          letterSpacing: "-0.8px",
          opacity: focused ? 0 : 1,
          maxHeight: focused ? 0 : "120px",
          marginBottom: focused ? 0 : "24px",
          pointerEvents: focused ? "none" : "auto",
        }}
      >
        {/* 21번 — phrase 변경 시 아래에서 슬라이드 업 + fade-in.
            key={phrase} 로 React 가 매번 새 노드로 mount → CSS keyframe 재실행. */}
        <span
          key={phrase}
          className="inline-block animate-[heroPhraseUp_420ms_cubic-bezier(0.2,0,0,1)_both]"
        >
          {phrase}
        </span>
      </h1>
      {/* 검색창 — 스크롤해도 상단 고정 (TopNav 56px 아래)
          ※ 부모 main 영역의 좌우 패딩(px-4 sm:px-6)을 음수 마진으로 상쇄해서
             배경이 화면 끝까지 차도록 처리 */}
      <div
        className="sticky top-[56px] z-30 -mx-4 px-4 py-2 sm:-mx-6 sm:px-6"
        style={{
          backgroundColor: "var(--bg)",
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

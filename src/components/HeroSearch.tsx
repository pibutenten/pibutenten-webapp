"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

const MOBILE_BP = 768;
const TARGET_TOP = 100; // 모바일 키보드 ON 시 검색창 top px (nav 56 + 여유 44)

/**
 * Hero(타이틀) + 검색창 묶음.
 * - 모바일: focus마다 main 슬라이드 업 (state 변화 없어도 매번 reposition).
 *   input blur는 main 유지(키워드 칩 클릭 시 위치 그대로). 진짜 키보드 닫힘만 reset.
 * - 데스크탑: h1/슬라이드 변화 없음, 진입 시 자동 포커스.
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);

  const isMobile = useCallback(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP,
    [],
  );

  const repositionMain = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isMobile()) return;
    const main = document.querySelector("main");
    if (!main) return;
    const form = formWrapRef.current?.querySelector("form");
    if (!form) return;
    main.style.transition = "none";
    main.style.transform = "none";
    void (main as HTMLElement).offsetHeight;
    const rect = form.getBoundingClientRect();
    const shift = Math.min(0, -(rect.top - TARGET_TOP));
    main.style.transition = "transform 0.3s ease";
    main.style.transform = shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;
  }, [isMobile]);

  const resetMain = useCallback(() => {
    if (typeof window === "undefined") return;
    const main = document.querySelector("main");
    if (!main) return;
    main.style.transition = "transform 0.3s ease";
    main.style.transform = "";
  }, []);

  // SearchBar focus/blur 콜백 — 데스크탑은 무시, 모바일은 매 focus마다 reposition (blur는 main 유지)
  function handleFocusChange(f: boolean) {
    if (!isMobile()) {
      setFocused(false);
      return;
    }
    setFocused(f);
    if (f) repositionMain();
    // f=false (blur) 시 main reset 안 함 → 키보드 닫혀도 위치 유지
    // 진짜 키보드 닫힘은 visualViewport에서 감지해서 reset
  }

  // visualViewport: 진짜 키보드 닫힘 감지 → main reset
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    let lastKeyboardOpen = false;
    const handler = () => {
      const keyboardOpen =
        window.innerHeight - window.visualViewport!.height > 100;
      if (lastKeyboardOpen && !keyboardOpen) {
        setFocused(false);
        resetMain();
      }
      lastKeyboardOpen = keyboardOpen;
    };
    window.visualViewport.addEventListener("resize", handler);
    return () =>
      window.visualViewport?.removeEventListener("resize", handler);
  }, [resetMain]);

  return (
    <header className="text-center pt-10 sm:pt-14">
      <h1
        className="overflow-hidden font-extrabold text-[var(--primary)] transition-[opacity,max-height,margin] duration-300"
        style={{
          fontSize: "clamp(26px, 6vw, 32px)",
          letterSpacing: "-0.8px",
          opacity: focused ? 0 : 1,
          maxHeight: focused ? 0 : "120px",
          marginBottom: focused ? 0 : "32px",
          pointerEvents: focused ? "none" : "auto",
        }}
      >
        피부가 예뻐지는 모든 이야기
      </h1>
      <div ref={formWrapRef}>
        <SearchBar
          initialValue={initialQ}
          onFocusChange={handleFocusChange}
          autoFocusOnDesktop={!initialQ}
        />
      </div>
    </header>
  );
}

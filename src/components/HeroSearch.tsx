"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

/**
 * Hero(타이틀) + 검색창 묶음.
 * 모바일에서 input focus 시:
 *   1) h1을 collapse + fade out (위 여백 회수)
 *   2) main 전체를 위로 translate (검색창이 nav 바로 아래로 올라옴)
 * blur(빈 입력) 또는 키보드 닫힘 시 원상복귀.
 *
 * 정적 사이트 (pbtt-search/js/app.js의 setupSearchUX) 동작 이식.
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);

  // main 요소를 슬라이드 업 / 다운
  useEffect(() => {
    if (typeof window === "undefined") return;
    const main = document.querySelector("main");
    if (!main) return;

    if (!focused) {
      main.style.transition = "transform 0.3s ease";
      main.style.transform = "";
      return;
    }

    // 모바일에서만 슬라이드 (≤768px)
    if (window.innerWidth > 768) return;
    const form = formWrapRef.current?.querySelector("form");
    if (!form) return;

    // 측정 정확도를 위해 일시적으로 transform 제거
    main.style.transition = "none";
    main.style.transform = "none";
    void (main as HTMLElement).offsetHeight;

    const rect = form.getBoundingClientRect();
    // navbar(56) + 여유(24) = 80px 위치 — 살짝 더 위로
    const TARGET_TOP = 80;
    const shift = Math.min(0, -(rect.top - TARGET_TOP));

    main.style.transition = "transform 0.3s ease";
    main.style.transform = shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;

    return () => {
      // unmount 시 정리
      main.style.transform = "";
    };
  }, [focused]);

  // visualViewport: 키보드 닫힘 감지 (Android 시스템 백버튼 등)
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    let lastKeyboardOpen = false;
    const handler = () => {
      const keyboardOpen =
        window.innerHeight - window.visualViewport!.height > 100;
      if (lastKeyboardOpen && !keyboardOpen) {
        setFocused(false);
      }
      lastKeyboardOpen = keyboardOpen;
    };
    window.visualViewport.addEventListener("resize", handler);
    return () =>
      window.visualViewport?.removeEventListener("resize", handler);
  }, []);

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
        <SearchBar initialValue={initialQ} onFocusChange={setFocused} />
      </div>
    </header>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

const MOBILE_BP = 768;
const TARGET_TOP = 70; // 키보드 ON 시 검색창 top px (헤더 56 + 여유 14)

/**
 * Hero(타이틀) + 검색창 묶음.
 * - 모바일:
 *   - focus → 원래 scrollY 기억 + 350ms 후(키보드 안정) reposition.
 *   - blur → 기억해둔 원래 scrollY로 복귀.
 *   - 칩 클릭 시엔 칩 onMouseDown preventDefault로 input blur 자체를 막아 위치 유지.
 *   - 두 번째 focus도 매번 재기억 + 재reposition.
 * - 데스크탑: h1 변화 없음, 진입 시 자동 포커스.
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);
  const originalScrollYRef = useRef<number>(0);

  const isMobile = useCallback(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP,
    [],
  );

  /** 페이지 스크롤로 form을 정확히 TARGET_TOP에 배치 */
  const repositionPage = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isMobile()) return;
    const form = formWrapRef.current?.querySelector("form");
    if (!form) return;
    const rect = form.getBoundingClientRect();
    const diff = rect.top - TARGET_TOP;
    if (Math.abs(diff) < 2) return;
    window.scrollBy({ top: diff, behavior: "smooth" });
  }, [isMobile]);

  /** focus → 원래 위치 기억 + state 갱신, blur → 원래 위치 복귀 */
  function handleFocusChange(f: boolean) {
    if (!isMobile()) {
      setFocused(false);
      return;
    }
    if (f) {
      // 매 focus마다 원래 scrollY 갱신 (이미 위로 올라간 상태에서 두 번째 focus면 이미 위에 있음 → 변동 작음)
      // 단, 우리 transform 적용 직전 스크롤만 기억해야 하므로, "처음" focus만 기억.
      if (!focused) originalScrollYRef.current = window.scrollY;
      setFocused(true);
    } else {
      // blur → 원래 위치로 복귀
      window.scrollTo({
        top: originalScrollYRef.current,
        behavior: "smooth",
      });
      setFocused(false);
    }
  }

  /** visualViewport — 키보드 안정 후 한 번 reposition */
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let stableTimer: number | null = null;

    const handler = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      const ourInput = formWrapRef.current?.querySelector("input");
      const inputFocused =
        !!ourInput && document.activeElement === ourInput;

      if (keyboardOpen && inputFocused) {
        if (stableTimer) window.clearTimeout(stableTimer);
        stableTimer = window.setTimeout(() => {
          stableTimer = null;
          repositionPage();
        }, 350) as unknown as number;
      } else if (!keyboardOpen && stableTimer) {
        window.clearTimeout(stableTimer);
        stableTimer = null;
      }
    };

    vv.addEventListener("resize", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      if (stableTimer) window.clearTimeout(stableTimer);
    };
  }, [repositionPage]);

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

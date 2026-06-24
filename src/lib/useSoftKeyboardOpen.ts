"use client";

/**
 * useSoftKeyboardOpen — 모바일 소프트 키보드가 열렸는지 추정하는 훅.
 *
 * window.visualViewport 의 resize 로 추정한다: 키보드가 올라오면 visualViewport.height 가
 * 레이아웃 뷰포트(window.innerHeight)보다 줄어든다. 그 차이가 임계(THRESHOLD_PX)를 넘으면 open.
 *
 * - visualViewport 미지원(null)이면 항상 false(닫힘) 반환 — 안드로이드 구형/일부 WebView 폴백.
 *   (이 경우 키보드가 떠도 FAB·탭바가 가려지지 않는다 — 과거 동작과 동일한 안전한 기본값.)
 * - 글쓰기 FAB(WriteFab)·하단 탭바(AppShell)가 키보드 위에 겹쳐 입력을 가리지 않도록 숨기는 데 사용.
 */

import { useEffect, useState } from "react";

/** 이만큼(px) 이상 뷰포트가 줄면 키보드가 열린 것으로 본다(주소창 축소 등 작은 변동과 구분). */
const THRESHOLD_PX = 120;

export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    // 미지원(null) → 항상 닫힘으로 간주(폴백). 구독도 걸지 않는다.
    if (!vv) return;

    const update = () => {
      // 레이아웃 뷰포트 대비 시각 뷰포트가 THRESHOLD_PX 이상 작아지면 키보드가 열린 것으로 추정.
      const gap = window.innerHeight - vv.height;
      setOpen(gap > THRESHOLD_PX);
    };

    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return open;
}

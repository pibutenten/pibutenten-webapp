"use client";

/**
 * 앱 구동(=홈 화면 아이콘에서 standalone 진입) 직후 1.5초간 동그라미 로고를 큼지막하게
 * 보여주는 in-app splash overlay.
 *
 * 적용 조건:
 *   - display-mode: standalone (홈 화면 아이콘으로 진입한 케이스만)
 *   - 같은 세션에서 한 번만 노출 (sessionStorage 마킹)
 *
 * 일반 브라우저 탭 방문에는 노출되지 않음 — 이미 들어와서 콘텐츠 보고 있는 사용자에게
 * 갑자기 splash가 뜨면 어색함.
 */
import { useEffect, useState } from "react";

const SESSION_FLAG = "pibutenten-splash-shown";
const SHOW_MS = 1500;
const FADE_MS = 350;

export default function AppSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // standalone 모드(홈 화면 아이콘 진입)에서만 노출
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      );
    if (!isStandalone) return;

    // 이번 세션에서 이미 한 번 보여줬으면 스킵
    try {
      if (sessionStorage.getItem(SESSION_FLAG) === "1") return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* sessionStorage 막힘 — 한 번 보여주고 끝 */
    }

    setVisible(true);
    const fadeTimer = window.setTimeout(() => setFading(true), SHOW_MS);
    const hideTimer = window.setTimeout(
      () => setVisible(false),
      SHOW_MS + FADE_MS,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        backgroundColor: "#71BFEA",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: "none",
      }}
    >
      {/* 로고 — 인위적 scale 애니 제거 (사용자 요청). 배경 fade-out만 자연스럽게 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/splash-circle-512.png"
        alt=""
        className="h-40 w-40"
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { APP_STORE_URL, PLAY_STORE_URL } from "./stores";

/**
 * 방문 기기의 OS 를 감지해 알맞은 스토어로 자동 이동.
 *
 *  - iOS(iPhone/iPad/iPod) → App Store
 *  - Android → Play 스토어
 *  - 그 외(데스크톱 등) → 이동하지 않음 → page.tsx 의 두 버튼을 그대로 노출
 *
 *  ⚠ 크롤러(OG 미리보기 봇)는 JS 를 실행하지 않으므로 리다이렉트되지 않는다.
 *     → 공유 카드(opengraph-image)는 정상 수집되고, 실제 사용자만 스토어로 이동.
 *  ⚠ inline <script> 대신 client 컴포넌트 → CSP inline-script 차단 회피.
 */
export default function AppStoreRedirect() {
  // 데스크톱(또는 미감지)일 때만 버튼 안내 문구를 보이기 위한 플래그.
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";

    // iPadOS 13+ 는 데스크톱 Safari UA 로 위장 → 터치 포인트로 보강 감지.
    // 임계값 >= 5: 터치스크린 MacBook(maxTouchPoints 가 1~2 정도)을
    // iOS 로 오판하지 않도록 업계 표준값을 사용한다.
    const isIpadOS =
      /Macintosh/.test(ua) &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints >= 5;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || isIpadOS;
    const isAndroid = /Android/.test(ua);

    if (isIOS) {
      window.location.replace(APP_STORE_URL);
      return;
    }
    if (isAndroid) {
      window.location.replace(PLAY_STORE_URL);
      return;
    }
    // 데스크톱 등 — 자동 이동 없이 두 버튼 노출.
    setShowHint(true);
  }, []);

  if (!showHint) return null;

  return (
    <p
      style={{
        marginTop: 4,
        fontSize: 13,
        lineHeight: 1.6,
        color: "rgba(255,255,255,0.85)",
        textAlign: "center",
      }}
    >
      모바일에서 열면 사용 중인 기기의 스토어로 자동 이동합니다.
    </p>
  );
}

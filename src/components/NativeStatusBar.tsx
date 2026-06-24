"use client";

import { useEffect } from "react";

/**
 * 네이티브(Capacitor) 상태바 글씨/아이콘 색 보정.
 *
 * 문제: 상단 상태바(시계·통신·배터리) 배경은 밝은 브랜드색(헤더 #e8f5fd 가 비침)인데
 *   아이콘이 흰색으로 떨어져 안 보였다(특히 Android 15 edge-to-edge 에서 빌드 시점 config
 *   style 이 안정적으로 적용 안 됨). OS 는 상태바 글씨를 '검정' 또는 '흰색'만 지원하므로,
 *   밝은 배경엔 어두운(검정) 글씨가 맞다.
 *
 * 해법: 웹뷰 로드 후 런타임에 `StatusBar.setStyle({ style: Style.Light })` 를 호출한다.
 *   Capacitor Style.Light = "밝은 배경용 → 어두운(검정) 콘텐츠". 런타임 호출이라 빌드 시점
 *   config 보다 안정적으로 적용되고, 상태바 플러그인이 이미 설치된 라이브 앱에는 **웹 배포만으로**
 *   즉시 반영된다(새 앱 빌드 불필요). 배경(overlay·헤더색)은 건드리지 않는다 — 글씨색만 보정.
 *
 * 비네이티브(웹/PWA)에서는 즉시 no-op (동적 import 가드).
 */
export default function NativeStatusBar() {
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // 밝은 배경 → 어두운(검정) 시계·배터리 글씨.
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        /* @capacitor 미존재(웹) 또는 로드 실패 — no-op */
      }
    })();
  }, []);

  return null;
}

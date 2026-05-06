"use client";

import { useEffect, useState } from "react";

/**
 * 카카오톡/페이스북/네이버 등 인앱 브라우저(WebView) 감지 → 외부 브라우저로 열기 안내.
 * 구글 OAuth는 disallowed_useragent로 인앱에서 차단됨.
 */
export default function InAppBrowserNotice() {
  const [isInApp, setIsInApp] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("kakaotalk")) setIsInApp("카카오톡");
    else if (ua.includes("fb_iab") || ua.includes("fban") || ua.includes("fbav"))
      setIsInApp("페이스북");
    else if (ua.includes("instagram")) setIsInApp("인스타그램");
    else if (ua.includes("naver(inapp")) setIsInApp("네이버");
    else if (ua.includes("line/")) setIsInApp("라인");
  }, []);

  if (!isInApp) return null;

  function openExternal() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const ua = navigator.userAgent.toLowerCase();
    // Android: intent:// 스킴으로 Chrome 강제 호출
    if (/android/.test(ua)) {
      window.location.href = `intent://${url.replace(
        /https?:\/\//,
        "",
      )}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    // iOS: x-safari-https:// 스킴
    if (/iphone|ipad|ipod/.test(ua)) {
      window.location.href = url.replace(/^https?:\/\//, "x-safari-https://");
      return;
    }
    // 그 외: URL 복사
    navigator.clipboard?.writeText(url);
    alert("주소가 복사되었어요. Chrome/Safari에서 붙여넣으세요.");
  }

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="mb-2 font-bold">
        ⚠️ {isInApp} 인앱 브라우저에서는 구글/카카오 로그인이 차단됩니다
      </div>
      <p className="mb-3 text-xs leading-relaxed">
        보안 정책으로 인해 외부 브라우저(Chrome / Safari)에서만 로그인 가능합니다.
        우측 상단 메뉴에서 <b>&quot;다른 브라우저로 열기&quot;</b> 또는 아래 버튼을
        눌러주세요.
      </p>
      <button
        type="button"
        onClick={openExternal}
        className="rounded-md bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
      >
        외부 브라우저로 열기
      </button>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/session-context";

/**
 * LandingTracker — 유입 분석(Acquisition) 랜딩 비컨(세션 1회).
 *
 * 방문 세션의 "첫 진입"에서만 document.referrer·랜딩 경로·UTM 을 /api/landing 으로 1회 전송한다.
 * sessionStorage 플래그로 탭 세션당 1회만(SPA 내부 이동·재방문은 미전송). 서버가 채널 분류·UA/지역
 * 파싱 후 traffic_landings 에 적재. best-effort — 실패 무시(사용자 경험 불간섭).
 *
 * ⚠ referrer 는 진입 직후에만 유효(SPA 라우팅 후 바뀜) → 마운트 즉시 캡처한다.
 */
const FLAG = "pbtt_landed";

export default function LandingTracker() {
  const session = useSession();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1"); // 선설정 — 중복/재시도 방지(실패해도 재전송 안 함)
    } catch {
      return; // sessionStorage 불가(사생활 모드 등)면 조용히 skip
    }

    const payload = JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer || "",
      search: window.location.search || "",
      isMember: !!session,
    });

    // keepalive: 진입 직후 이탈해도 전송 보장. 실패는 무시.
    void fetch("/api/landing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
    // 마운트 1회만 — session 늦게 확정돼도 재전송 안 함(is_member 는 참고값).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

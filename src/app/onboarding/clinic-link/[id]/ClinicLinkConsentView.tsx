"use client";

/**
 * ClinicLinkConsentView — /onboarding/clinic-link/[id] "병원 연결 동의" 셸 (클라이언트).
 *
 * OnboardingView 패턴 복제(B5, 계획 §8.3): 상단바만 앱 셸, 본문은 children 으로 주입.
 *   - 셸은 wide 모드 — 온보딩형 전체화면 흐름에서 5탭 하단바가 게이트 우회 경로가 되지 않게 숨김.
 *     active 는 타입 만족용("마이") — wide 라 탭바·강조 미노출.
 *   - back 미지정·검색 비활성 — 동의/거절 응답으로만 벗어나는 화면.
 *   - 제목은 병원 표시명({clinic_display_name}...)에 의존하는 동적 문구라 OnboardingView 와 달리
 *     헤더를 셸에 두지 않고 Client(데이터 로드측)가 렌더한다.
 *
 * 격리: app.module.css 무수정. 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import type { ReactNode } from "react";
import AppShell from "@/components/skin/AppShell";

export default function ClinicLinkConsentView({ children }: { children: ReactNode }) {
  return (
    <AppShell active="마이" wide keepCanvas>
      <section className="mx-auto w-full max-w-[640px] py-6">{children}</section>
    </AppShell>
  );
}

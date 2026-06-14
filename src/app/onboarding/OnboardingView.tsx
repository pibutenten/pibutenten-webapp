"use client";

/**
 * OnboardingView — /onboarding "피부정보 입력(다단계 폼)" 본문 래퍼 (클라이언트).
 *
 * 원칙(베타 스킨 승격, 2026-06-15): 상단바만 베타 셸, 본문은 운영 형태 그대로 유지.
 *   ⚠️ 온보딩은 가장 민감(미들웨어 강제 게이트·이메일 dedup·IDENTITY 쿠키 기준 targetProfileId).
 *      - 가드·쿠키·dedup·avatar 결정·OnboardingClient prop 등 모든 로직은 server page.tsx 가 100% 책임.
 *      - 폼 본체(ReturningUserNotice·OnboardingClient)는 page.tsx 에서 렌더해 children 으로 주입.
 *        이 View 는 헤더 문구 + 셸 래핑만 — 폼/로직/쿠키/redirect 일절 건드리지 않는다.
 *   - 셸은 wide 모드 — 피드용 5탭 하단바가 온보딩 강제 게이트 흐름(탭으로 게이트 우회)을 방해하지
 *     않도록 탭바를 숨긴다. active 는 타입 만족용("마이") — wide 라 탭바·강조 미노출.
 *   - back 미지정 — 온보딩은 '뒤로' 로 게이트를 벗어나면 안 됨(탈출은 본문 '다시 로그인' 버튼만). 검색 비활성.
 *
 * 격리: beta-skin.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import type { ReactNode } from "react";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";

export default function OnboardingView({ children }: { children: ReactNode }) {
  return (
    <BetaSkinShell active="마이" wide>
      <section className="mx-auto w-full max-w-[640px] py-6">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            피부텐텐에 오신 걸 환영해요
          </h1>
          {/* 두 안내문 같은 크기/색으로 통일 — text-sm + text-[var(--text-secondary)] */}
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            나에게 꼭 맞는 피부 정보를 추천하기 위해 몇 가지만 알려주세요.
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            추후에도 언제든지 변경하실 수 있어요.
          </p>
        </header>
        {children}
      </section>
    </BetaSkinShell>
  );
}

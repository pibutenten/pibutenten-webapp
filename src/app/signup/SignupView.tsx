"use client";

/**
 * SignupView — /signup "가입 마무리(약관 동의)" 본문 래퍼 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): LoginView 와 동일하게 상단바만 앱 셸, 본문은 운영 형태 유지.
 *   - 폼 본체(ReturningUserNotice·SignupForm)는 server page.tsx 에서 렌더해 children 으로 주입.
 *     → 가입 가드·redirect·OAuth 메타 닉네임 추출 등 모든 로직은 page.tsx 가 100% 책임.
 *       이 View 는 표시 래핑만 — 폼 컴포넌트 내부·prop 일절 건드리지 않는다.
 *   - 셸은 wide 모드(인증 화면 탭바 부적절·온보딩 게이트 일관성). active 는 타입 만족용("마이").
 *   - back 미지정 — 가입 마무리 단계는 '뒤로' 부적절(탈출은 본문 내 '다시 로그인' 버튼으로). 검색 비활성.
 *
 * 격리: app.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import type { ReactNode } from "react";
import AppShell from "@/components/skin/AppShell";

export default function SignupView({ children }: { children: ReactNode }) {
  return (
    <AppShell active="마이" wide keepCanvas>
      <section className="mx-auto w-full max-w-[440px] py-10">
        <h1 className="mb-2 text-center text-xl font-bold text-[var(--text)]">
          가입 마무리하기
        </h1>
        <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
          피부텐텐에 오신 걸 환영해요. 잠깐만 확인해 주세요.
        </p>
        {children}
      </section>
    </AppShell>
  );
}

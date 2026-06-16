"use client";

/**
 * LoginView — /login "로그인 진입" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): DoctorDashboardView·NotificationsView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 LoginForm(OAuth 진입 버튼·에러 표시)을 그대로 임베드(재포장 X).
 *     인증 가드·redirect·이미 로그인 분기는 server page.tsx 가 100% 책임(여기는 표시만).
 *   - 셸은 wide 모드 — 인증 화면에 피드용 5탭 하단바가 부적절하고, 특히 온보딩 강제 게이트
 *     흐름과 일관되게 탭바를 숨긴다. active 는 타입 만족용("마이") — wide 라 탭바·강조 미노출.
 *   - back 미지정 — 로그인 진입은 '뒤로' 가 부적절(보통 게이트 redirect 로 도달). 검색 비활성.
 *
 * 격리: app.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import AppShell from "@/components/skin/AppShell";
import LoginForm from "./LoginForm";

export default function LoginView({
  next,
  error,
  errorId,
}: {
  next?: string;
  error?: string;
  errorId?: string;
}) {
  return (
    <AppShell active="마이" wide>
      <section className="mx-auto w-full max-w-[400px] py-10">
        <h1 className="mb-6 text-center text-xl font-bold text-[var(--text)]">
          피부텐텐 로그인
        </h1>
        <LoginForm next={next} error={error} errorId={errorId} />
      </section>
    </AppShell>
  );
}

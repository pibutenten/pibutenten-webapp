"use client";

/**
 * LoginConflictView — /login/conflict "다중채널 가입 충돌" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): LoginView 와 동일하게 상단바만 앱 셸, 본문은
 *   운영 안내 형태(아이콘·문구·기존/홈 이동 링크) 그대로 임베드. 텍스트·링크 로직 무변경.
 *   - existing/attempted 라벨 가공·metadata(noindex)는 server page.tsx 가 책임(여기는 표시만).
 *   - 셸은 wide 모드(인증 화면 탭바 부적절·온보딩 게이트 일관성). active 는 타입 만족용("마이").
 *   - back 미지정 — 본문 안에 '기존 채널로 로그인' · '홈으로' 이동 링크가 이미 있어 중복 불필요.
 *
 * 격리: app.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import Link from "next/link";
import AppShell from "@/components/skin/AppShell";

export default function LoginConflictView({
  existing,
  attempted,
}: {
  existing: string;
  attempted: string;
}) {
  return (
    <AppShell active="마이" wide>
      <section className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 text-4xl">🔐</div>
        <h1 className="mb-2 text-xl font-bold text-[var(--text)]">
          이미 {existing}(으)로 가입된 이메일이에요
        </h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          같은 이메일이 다른 채널로 먼저 가입되어 있어서,
          <br />
          {attempted} 로그인은 자동으로 연결되지 않습니다.
        </p>
        <p className="mb-6 text-xs text-[var(--text-muted)]">
          보안을 위해 기존 채널로 로그인하신 뒤,
          <br />
          설정에서 직접 연결해 주세요.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Link
            href="/login"
            className="rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {existing}(으)로 로그인하기
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            홈으로 돌아가기
          </Link>
        </div>
        <p className="mt-6 text-xs text-[var(--text-muted)]">
          도움이 필요하시면{" "}
          <a
            href="mailto:pibutenten@gmail.com?subject=계정 채널 안내 문의"
            className="underline hover:text-[var(--primary)]"
          >
            pibutenten@gmail.com
          </a>{" "}
          으로 알려주세요.
        </p>
      </section>
    </AppShell>
  );
}

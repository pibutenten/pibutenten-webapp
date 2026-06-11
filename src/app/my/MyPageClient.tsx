"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-context";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";

const C = "#4cbff2";

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex w-full items-center justify-between px-4 py-3.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]">
      <span>{label}</span>
      <span className="text-[var(--text-muted)]">›</span>
    </Link>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {title && <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-muted)]">{title}</p>}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] bg-white">{children}</div>
    </div>
  );
}

// 마이페이지(회원 전용 — 관리자/원장은 page.tsx 가 대시보드로 리다이렉트).
//   계정 스위처 + 내 활동 + 설정(아코디언). 세션(아바타·identities)은 클라 출처라 클라 렌더.
export default function MyPageClient() {
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-[680px] animate-pulse pb-16 sm:pb-0">
        <div className="mb-4 h-[72px] rounded-[var(--radius)] bg-white" />
        <div className="h-40 rounded-[var(--radius)] bg-white" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-[680px] pb-16 sm:pb-0">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-base font-bold text-[var(--text)]">마이페이지</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">로그인하면 내 정보가 표시됩니다.</p>
          <Link href="/login" className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</Link>
        </div>
      </div>
    );
  }

  const active = session.identities.find((i) => i.id === session.activeIdentityId) ?? null;
  const handle = active?.handle ?? session.handle ?? null;

  return (
    <div className="mx-auto max-w-[680px] pb-16 sm:pb-0">
      {/* 활성 계정 + 계정 전환 (공용 카드) */}
      <AccountSwitcherCard />

      {/* 내 활동 */}
      <Section title="내 활동">
        <Row href="/notifications" label="알림" />
        {handle && <Row href={`/${handle}`} label="내 프로필" />}
        {handle && <Row href={`/${handle}?tab=saves`} label="저장한 글" />}
      </Section>

      {/* 설정 — 항목 아코디언(클릭 시 그 자리서 펼침, 실제 편집은 설정 페이지). */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] bg-white px-4 py-3.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)]"
        >
          설정
          <span className="text-[var(--text-muted)]">{settingsOpen ? "▴" : "▾"}</span>
        </button>
        {settingsOpen && (
          <div className="mt-1 divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] bg-white">
            <Row href="/settings/profile" label="프로필·계정 설정" />
          </div>
        )}
      </div>
    </div>
  );
}

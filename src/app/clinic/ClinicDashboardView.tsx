"use client";

/**
 * ClinicDashboardView — /clinic 병원 대시보드 (B4 재설계, 관리자 /admin 운영 페이지 패턴).
 *
 * 구성(관리자 AdminView 골격 이식):
 *   - 헤더: 지점명.
 *   - 현황 Stat 카드 4종(연결 환자·동의 대기·오늘 노트·이번 달 노트). 환자 카드는 목록으로 링크.
 *   - "운영 프로그램" Tool 카드 그리드 — 각 프로그램이 별도 페이지(환자 등록·목록·시술노트 작성).
 *     준비중 프로그램(예약 리마인더·지점 통계)은 딤드로 자리만.
 *
 * 규칙(§8.4): 라이트 테마, 색은 CSS 변수만, 그림자 미사용, 존댓말, 모바일 우선.
 */

import Link from "next/link";
import { ClinicShell } from "./_shared";

export type ClinicDashboardStats = {
  pending_count: number;
  active_count: number;
  notes_today: number;
  notes_month: number;
};

export default function ClinicDashboardView({
  clinicName,
  stats,
}: {
  clinicName: string;
  stats: ClinicDashboardStats;
}) {
  return (
    <ClinicShell back="/">
      <section className="mx-auto w-full max-w-[860px] py-6">
        {/* 헤더 */}
        <header className="mb-5">
          <h1 className="text-[20px] font-bold leading-[1.4] text-[var(--text)]">{clinicName}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            회원의 동의를 받은 뒤 시술노트를 대신 작성하는 병원 운영 페이지예요.
          </p>
        </header>

        {/* 현황 — 숫자 카드 4종. 모바일 2열, 데스크탑 4열. */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Stat label="연결 환자" value={stats.active_count} href="/clinic/patients" />
          <Stat
            label="동의 대기"
            value={stats.pending_count}
            highlight={stats.pending_count > 0}
            href="/clinic/patients"
          />
          <Stat label="오늘 작성 노트" value={stats.notes_today} />
          <Stat label="이번 달 노트" value={stats.notes_month} />
        </div>

        {/* 운영 프로그램 */}
        <h2 className="mb-3 mt-7 text-[14px] font-bold text-[var(--text)]">운영 프로그램</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Tool
            href="/clinic/patients/new"
            emoji="🧾"
            title="환자 등록"
            desc="아이디·이름·생년월일로 회원에게 동의 요청 보내기"
          />
          <Tool
            href="/clinic/patients"
            emoji="👥"
            title="환자 목록"
            desc="연결된 환자 검색·상세·병원 기록 관리"
          />
          <Tool
            href="/clinic/visits/new"
            emoji="✍️"
            title="시술노트 작성"
            desc="동의한 환자의 시술 내역을 대신 기록하기"
            highlight
          />
          <ToolDisabled emoji="⏰" title="예약 리마인더" desc="다음 예약일 관리 — 준비 중" />
          <ToolDisabled emoji="📊" title="지점 통계" desc="시술·환자 통계 — 준비 중" />
        </div>
      </section>
    </ClinicShell>
  );
}

function Stat({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div className="whitespace-nowrap text-[11.5px] leading-tight text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 whitespace-nowrap text-[22px] font-extrabold tabular-nums ${
          highlight ? "text-[var(--primary-active)]" : "text-[var(--text)]"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </>
  );
  const cls = `block overflow-hidden rounded-[var(--radius)] border p-3 ${
    highlight
      ? "border-[var(--primary-soft)] bg-[var(--primary-soft)]"
      : "border-[var(--border)] bg-white"
  }`;
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Tool({
  href,
  emoji,
  title,
  desc,
  highlight,
}: {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-[var(--radius)] border p-4 transition-colors ${
        highlight
          ? "border-[var(--primary-soft)] bg-[var(--primary-soft)] hover:bg-[var(--primary-soft)]"
          : "border-[var(--border)] bg-white hover:bg-[var(--bg)]"
      }`}
    >
      <span className="text-[22px]">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-[var(--text)]">{title}</span>
        <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">{desc}</span>
      </span>
      <span className="text-[var(--text-muted)]">→</span>
    </Link>
  );
}

/** 준비중 프로그램 — 클릭 불가(자리만). */
function ToolDisabled({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 opacity-55"
      aria-disabled="true"
    >
      <span className="text-[22px] grayscale">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-[var(--text-muted)]">{title}</span>
        <span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">{desc}</span>
      </span>
    </div>
  );
}

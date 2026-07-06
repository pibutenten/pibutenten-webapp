"use client";

/**
 * ClinicDashboardView — /clinic 병원 대시보드 (S2 admin 재정렬, 계획 SSOT §2.1 · C10).
 *
 * 원칙: 관리자 대시보드(/admin AdminView)와 **동일한 UI/UX·디자인 토큰**.
 *   - 숫자 카드·프로그램 카드는 공용 `Stat`·`Tool`(components/skin/OpsCards) 재사용 —
 *     admin 과 드리프트 0. 앞서 `--primary/--text` 로 만든 커스텀 톤은 제거.
 *   - 셸은 ClinicShell(AppShell wide) 유지.
 *
 * 구성:
 *   - 헤더: 지점명(--ink-700 2xl bold) + 부제(--ink-300).
 *   - 현황 Stat 4: 연결 환자 · 동의 대기(>0 강조) · 오늘 기록 · 이번 달 기록.
 *   - 운영 프로그램 Tool: 👥 환자 관리(active) · 📋 시술기록 관리(S4 전까지 준비중 딤드) ·
 *     ⏰ 예약 리마인더(준비중) · 📊 지점 통계(준비중).
 *
 * 명칭 규약(C14): "환자 관리"·"시술기록 관리" — 'DB' 표기 안 씀.
 */

import { Stat, Tool } from "@/components/skin/OpsCards";
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
        {/* 헤더 — admin 톤(제목 --ink-700, 부제 --ink-300). */}
        <header className="mb-5">
          <h1 className="text-2xl font-bold leading-[1.4]" style={{ color: "var(--ink-700)" }}>
            {clinicName}
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-300)" }}>
            회원의 동의를 받은 뒤 시술노트를 대신 작성하는 병원 운영 페이지예요.
          </p>
        </header>

        {/* 현황 — Stat 카드 4종(공용). 모바일 2열, 데스크탑 4열. */}
        <div className={STAT_GRID}>
          <Stat label="연결 환자" value={stats.active_count} href="/clinic/patients" />
          <Stat
            label="동의 대기"
            value={stats.pending_count}
            highlight={stats.pending_count > 0}
            href="/clinic/patients"
          />
          <Stat label="오늘 기록" value={stats.notes_today} />
          <Stat label="이번 달 기록" value={stats.notes_month} />
        </div>

        {/* 운영 프로그램 — Tool 카드(공용). admin 톤 딤드는 아래 ToolDisabled. */}
        <h2 className="mb-3 mt-7 text-sm font-bold" style={{ color: "var(--ink-900)" }}>
          운영 프로그램
        </h2>
        <div className={TOOL_GRID}>
          <Tool
            href="/clinic/patients"
            emoji="👥"
            title="환자 관리"
            desc="환자 검색·등록·연결 관리"
          />
          {/* 시술기록 관리 — /clinic/visits 는 S4 미구현. 지금은 준비중 딤드(비링크).
              S4 에서 /clinic/visits 활성화(계획 SSOT §2.5). */}
          <ToolDisabled
            emoji="📋"
            title="시술기록 관리"
            desc="전체 시술기록·수정 — 준비 중"
          />
          <ToolDisabled emoji="⏰" title="예약 리마인더" desc="다음 예약일 관리 — 준비 중" />
          <ToolDisabled emoji="📊" title="지점 통계" desc="시술·환자 통계 — 준비 중" />
        </div>
      </section>
    </ClinicShell>
  );
}

/* 그리드 상수는 소비처 자체 관리(카드만 공용) — admin GRID 관례 계승. */
const STAT_GRID = "grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4";
const TOOL_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";

/**
 * ToolDisabled — 준비중 프로그램(클릭 불가, 자리만). admin 톤(ink/line 토큰·borderRadius 14).
 * 공용 Tool 과 같은 레이아웃이되 링크 대신 딤드 div. S4 활성화 시 Tool 로 승격.
 */
function ToolDisabled({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div
      aria-disabled="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "#fff",
        padding: 16,
        opacity: 0.55,
      }}
    >
      <div style={{ fontSize: 22, filter: "grayscale(1)" }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink-500)" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 12, color: "var(--ink-500)" }}>{desc}</div>
      </div>
    </div>
  );
}

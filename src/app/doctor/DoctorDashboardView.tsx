"use client";

/**
 * DoctorDashboardView — /doctor "원장 대시보드" 본문 (클라이언트).
 *
 * 원칙(사용자 지시, 2026-06-15): 관리자 대시보드 재설계(BetaAdminView)와 같은 방식으로
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 형태를 최대한 유지". 큰 .card 박스에 욱여넣지 않는다.
 *   - 운영 /doctor/page.tsx 의 본문 구조(내 글 KPI · 운영 프로그램 Tool 그리드 · 인기 검색어/태그)를
 *     운영 Tailwind 톤 그대로 임베드(재포장 X). 데이터·권한·통계 로직은 운영 page.tsx 가 책임(여기는 표시만).
 *   - 셸은 BetaSkinShell 의 wide 모드(풀폭 1080px, 하단 탭바 숨김, 상단바만 베타) — BetaAdminView 선례 동일.
 *   - active="마이"(미강조 톤), back=운영 BackButton(fallback "/"), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: beta-skin.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import Link from "next/link";
import AccountSwitcherCard from "@/components/AccountSwitcherCard";
import DoctorActivityKpis, { type DoctorKpi } from "./DoctorActivityKpis";
import { PopularSearchesCard, PopularTagsCard } from "@/app/admin/PopularCards";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";

type SearchRow = { query: string; cnt: number };
type TagRow = { keyword: string; cnt: number };

export default function DoctorDashboardView({
  doctorName,
  doctorSlug,
  pendingCount,
  kpiByDays,
  searchesByDays,
  tagsByDays,
}: {
  doctorName: string;
  doctorSlug: string;
  pendingCount: number;
  kpiByDays: Record<number, DoctorKpi>;
  searchesByDays: Record<number, SearchRow[]>;
  tagsByDays: Record<number, TagRow[]>;
}) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" wide back="/" {...search}>
      {/* 계정 스위처 — 어느 명함에서든 전환 가능(마이페이지와 동일, 운영 공용 카드 임베드). */}
      <AccountSwitcherCard compact />

      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">원장 대시보드</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {doctorName} · 본인 글 활동·관리 (영구 noindex)
        </p>
      </div>

      {/* 1) 본인 글 KPI — 기간 토글 6종 (운영 컴포넌트 그대로). */}
      <DoctorActivityKpis initialDays={1} dataByDays={kpiByDays} />

      {/* 2) 운영 프로그램 — Tool 카드 (운영 page.tsx 동일 구성·노출 조건·href). */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
          운영 프로그램
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Q&A 카드 직접 작성 — 통합 글쓰기 Q&A 탭. */}
          <Tool
            href="/write?tab=qa"
            emoji="📝"
            title="Q&A 카드 작성하기"
            desc="원장 명의 Q&A 카드를 직접 작성합니다"
          />
          <Tool
            href="/admin/cards"
            emoji="📚"
            title="전체 글 관리"
            desc="본인 카드 검색·필터·발행/보관 (본인 글 강제 필터링)"
          />
          <Tool
            href="/admin/cards?status=pending_review"
            emoji="⏳"
            title="검수 대기"
            desc={
              pendingCount > 0 ? `검수 대기 ${pendingCount}건` : "검수 후 발행 대기"
            }
            highlight={pendingCount > 0}
          />
          {doctorSlug && (
            <Tool
              href={`/admin/doctors/${doctorSlug}/edit`}
              emoji="👤"
              title="원장 프로필 편집"
              desc="본인 소개·사진·전문분야 수정"
            />
          )}
          <Tool
            href="/admin/comments"
            emoji="💬"
            title="댓글 관리"
            desc="본인 카드의 댓글 모더레이션"
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">
          새 글 쓰기는 우하단 글쓰기 버튼 또는{" "}
          <Link href="/write" className="underline hover:text-[var(--primary)]">
            /write
          </Link>{" "}
          로.
        </p>
      </div>

      {/* 3) 인기 검색어 / 인기 태그 — 사이트 전체 (운영 PopularCards 임베드). */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PopularSearchesCard initialDays={1} dataByDays={searchesByDays} />
        <PopularTagsCard initialDays={0} dataByDays={tagsByDays} />
      </div>
    </BetaSkinShell>
  );
}

/** 운영 page.tsx 의 Tool 컴포넌트 동일 스타일(운영 Tailwind 톤 그대로). */
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
      className={
        "group flex items-center gap-3 rounded-[var(--radius)] border bg-white p-4 transition-colors " +
        (highlight
          ? "border-amber-300 hover:border-amber-400"
          : "border-[var(--border)] hover:border-[var(--primary)]")
      }
    >
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--text)]">{title}</div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{desc}</div>
      </div>
    </Link>
  );
}

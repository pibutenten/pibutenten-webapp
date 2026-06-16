"use client";

/**
 * ProcedureReportView — /reports/{시술} 시술 리포트 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): DoctorDashboardView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 page.tsx 의 본문(ReportSampleNotice·ProcedureReportCard·전문의 Q&A 얇은 링크)을
 *     그대로 임베드(재포장 X). 데이터·generateMetadata·JSON-LD 는 server page 가 책임.
 *   - 셸은 active="피드"(미강조 톤), back="/"(운영 BackButton fallback 을 셸이 렌더 — 본문 내 중복 BackButton 제거),
 *     검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: app.module.css 무수정. JSON-LD <script> 는 server page 에 남겨 SEO 신호 100% 보존.
 */

import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ProcedureReport } from "@/lib/procedure-report";
import ProcedureReportCard from "@/components/report/ProcedureReportCard";
import ReportSampleNotice from "@/components/report/ReportSampleNotice";
import AppShell from "@/components/skin/AppShell";
import FeedSidebar from "@/components/skin/FeedSidebar";
import { useSearchRouting } from "@/components/skin/ui";

export default function ProcedureReportView({
  ko,
  report,
  reviews,
  reviewLiked,
  reviewTotal,
  topicsExists,
  popularTags,
  hotQa,
}: {
  ko: string;
  report: ProcedureReport;
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  reviewTotal: number;
  topicsExists: boolean;
  /** 사이드 '인기 태그' '전체' 탭 — 서버 빈도순 16개(홈과 동일 방식). */
  popularTags: string[];
  /** 사이드 '인기 Q&A' 후보 풀 — 의사 Q&A 카드(홈과 동일 방식). */
  hotQa: CardData[];
}) {
  const search = useSearchRouting();
  // 태그 클릭 → 운영 홈(/?q=) 검색 라우팅(홈 피드와 동일).
  const applyTag = (k: string) => search.onSearchSubmit(k);

  // 홈 피드와 동일한 우측 사이드바 — 인기태그·인기 Q&A·글쓰기 CTA.
  const sidebar = (
    <FeedSidebar popularTags={popularTags} hotQa={hotQa} onTagClick={applyTag} />
  );

  return (
    <AppShell
      active="피드"
      back="/"
      backTitle={
        <h1>
          {ko} 후기 리포트 <b>{report.count}</b>건
        </h1>
      }
      sidebar={sidebar}
      {...search}
    >
      {/* 운영 본문 그대로 — 본문 내 BackButton 은 셸의 back="/" 으로 대체(중복 제거). */}
      <ReportSampleNotice count={report.count} procedureKo={report.procedureKo} />
      <ProcedureReportCard
        report={report}
        reviews={reviews}
        reviewLiked={reviewLiked}
        defaultExpanded
        variant="page"
        total={reviewTotal ?? reviews.length}
      />

      {/* 전문의 Q&A 허브 얇은 링크 — /topics 가 존재(의사 qa ≥4)할 때만. 한글 직접 타깃. */}
      {topicsExists && (
        <div className="mt-5">
          <Link
            href={`/topics/${encodeURIComponent(ko)}`}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]"
          >
            <span>
              <b className="text-[var(--primary)]">{ko}</b> 전문의 Q&A 보기
            </span>
            <span aria-hidden className="text-[var(--text-muted)]">
              →
            </span>
          </Link>
        </div>
      )}
    </AppShell>
  );
}

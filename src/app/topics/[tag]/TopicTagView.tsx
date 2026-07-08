"use client";

/**
 * TopicTagView — /topics/{태그} 토픽 허브 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): DoctorDashboardView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 page.tsx 의 본문(브레드크럼·태그 헤더·닫힌 리포트 글상자·CardMasonry·페이지네이션 안내)을
 *     운영 Tailwind 톤 그대로 임베드(재포장 X). 데이터·generateMetadata·JSON-LD 는 server page 가 책임.
 *   - 리포트 연결은 얇은 텍스트 링크 대신 닫힌 리포트 글상자(ReportSummaryBox — /reports 인덱스
 *     카드 접힘부와 동일 SSOT)를 Link 로 감싸 임베드. 요약·헤드라인은 server page 가 계산해 prop.
 *   - 셸은 active="피드"(미강조 톤), back="/"(운영 BackButton fallback), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: app.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 * JSON-LD <script> 는 server page 에 남겨 SEO 신호 100% 보존(이 컴포넌트는 표시만).
 */

import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ReportTagSummary } from "@/lib/procedure-report";
import AppShell from "@/components/skin/AppShell";
import FeedSidebar from "@/components/skin/FeedSidebar";
import ReportSummaryBox from "@/components/report/ReportSummaryBox";
import { PostCard, useSearchRouting } from "@/components/skin/ui";
import appStyles from "@/components/skin/app.module.css";

const PAGE_LIMIT = 50; // 운영 page.tsx 와 동일(페이지네이션 안내 임계)

export default function TopicTagView({
  tag,
  posts,
  count,
  reportSummary,
  popularTags,
  hotQa,
}: {
  tag: string;
  posts: CardData[];
  count: number;
  /** 이 시술의 /reports 요약 + 서버 확정 헤드라인. 리포트 없으면 null(글상자 미노출). */
  reportSummary: (ReportTagSummary & { headline: string }) | null;
  /** 사이드 '인기 태그' '전체' 탭 — 서버 빈도순 16개(홈과 동일 방식). */
  popularTags: string[];
  /** 사이드 '인기 Q&A' 후보 풀 — 의사 Q&A 카드(홈과 동일 방식). */
  hotQa: CardData[];
}) {
  const search = useSearchRouting();
  // 태그 클릭 → 운영 홈(/?q=) 검색 라우팅(홈 피드와 동일). 사이드바·카드 태그 칩 공통 사용.
  const applyTag = (k: string) => search.onSearchSubmit(k);

  // 홈 피드와 동일한 우측 사이드바 — 인기태그·인기 Q&A·글쓰기 CTA.
  const sidebar = (
    <FeedSidebar popularTags={popularTags} hotQa={hotQa} onTagClick={applyTag} />
  );

  return (
    <AppShell
      active="피드"
      /* 2뎁스 헤더 variant(R2-3) — 구 back="/"+backTitle 에서 전환: 모바일은 헤더 좌측 로고 자리
         뒤로가기, 데스크탑은 본문 뒤로 행. h1(SEO 유지 필수)은 본문 첫 요소로 이동(아래) —
         backHeader 는 backTitle 슬롯을 렌더하지 않으므로(AppShell back 분기 전용) 병행 불가. */
      backHeader={{ fallbackHref: "/" }}
      sidebar={sidebar}
      {...search}
    >
      {/* 페이지 h1 — 구 backTitle 에서 본문으로 이동(SEO/시각 유지). 셸 .backTitle>* 톤(18px/800)
          + 원장 요청 '연한 회색'(--ink-300, AA 4.73:1 근거는 app.module.css 주석) + count b 는
          구 .backTitle b(--tt-blue) 를 인라인으로 승계(app.module.css 무수정). */}
      <h1
        style={{
          margin: "0 0 14px",
          fontSize: 18,
          fontWeight: 800,
          lineHeight: 1.3,
          color: "var(--ink-300)",
        }}
      >
        피부과 전문의가 답한 {tag} 관련 Q&amp;A{" "}
        <b style={{ color: "var(--tt-blue)" }}>{count}</b>개
      </h1>
      {/* 닫힌 리포트 글상자 — 이 시술의 /reports 가 존재할 때만(후기 ≥1). 한글 직접 타깃(308 미경유).
          /reports 인덱스 카드 접힘부와 동일 시각(ReportSummaryBox SSOT — 2026-07-08 신디자인,
          D1 ① /topics 동시 반영)을 전체 클릭 Link 로 임베드. 라운드 18px = 신디자인 카드와 동일. */}
      {reportSummary && (
        <div className="mx-auto mb-5 max-w-[680px]">
          <Link
            href={`/reports/${encodeURIComponent(tag)}`}
            aria-label={`${tag} 시술 리포트 보기 (${reportSummary.count}건의 경험)`}
            className="block overflow-hidden rounded-[18px] bg-white"
          >
            <ReportSummaryBox
              procedureKo={tag}
              category={reportSummary.category}
              count={reportSummary.count}
              avgSatisfaction={reportSummary.satAvg ?? 0}
              avgPain={reportSummary.painAvg ?? 0}
              revisit={reportSummary.revisit}
              headline={reportSummary.headline}
            />
          </Link>
        </div>
      )}

      {/* 홈 피드와 동일한 단일열 PostCard 리스트(2열 Masonry → 단일열 feedList). */}
      <div className={appStyles.feedList}>
        {posts.map((card) => (
          <PostCard key={card.id} card={card} onTagClick={applyTag} />
        ))}
      </div>

      {count > PAGE_LIMIT && (
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          {PAGE_LIMIT}개 중 처음 {PAGE_LIMIT}개를 표시합니다. 더 보려면{" "}
          <Link
            href={`/?q=${encodeURIComponent(tag)}`}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            검색 페이지
          </Link>
          를 이용해주세요.
        </p>
      )}
    </AppShell>
  );
}

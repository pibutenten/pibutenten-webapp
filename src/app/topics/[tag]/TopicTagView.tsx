"use client";

/**
 * TopicTagView — /topics/{태그} 토픽 허브 본문 (클라이언트).
 *
 * 원칙(베타 스킨 승격, 2026-06-15): DoctorDashboardView 선례와 동일하게
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 page.tsx 의 본문(브레드크럼·#태그 헤더·리포트 얇은 링크·CardMasonry·페이지네이션 안내)을
 *     운영 Tailwind 톤 그대로 임베드(재포장 X). 데이터·generateMetadata·JSON-LD 는 server page 가 책임.
 *   - 셸은 active="피드"(미강조 톤), back="/"(운영 BackButton fallback), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: beta-skin.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 * JSON-LD <script> 는 server page 에 남겨 SEO 신호 100% 보존(이 컴포넌트는 표시만).
 */

import Link from "next/link";
import type { CardData } from "@/components/Card";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { PostCard, useBetaSearchRouting } from "@/app/beta-skin/beta-ui";
import betaStyles from "@/app/beta-skin/beta-skin.module.css";

const PAGE_LIMIT = 50; // 운영 page.tsx 와 동일(페이지네이션 안내 임계)

export default function TopicTagView({
  tag,
  posts,
  count,
  reportLink,
}: {
  tag: string;
  posts: CardData[];
  count: number;
  reportLink: { count: number } | null;
}) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="피드" back="/" {...search}>
      <header className="mb-6">
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--primary)]">
            홈
          </Link>{" "}
          / 태그
        </p>
        <h1 className="text-2xl font-bold text-[var(--text)]">#{tag}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          피부과 전문의가 답한 <strong>{tag}</strong> 관련 글{" "}
          <span className="font-bold text-[var(--primary)]">{count}</span>개.
        </p>
      </header>

      {/* 시술 리포트 얇은 링크 — 이 시술의 /reports 가 존재할 때만(후기 ≥1). 한글 직접 타깃(308 미경유). */}
      {reportLink && (
        <div className="mx-auto mb-5 max-w-[680px]">
          <Link
            href={`/reports/${encodeURIComponent(tag)}`}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 py-3 text-[14px] font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]"
          >
            <span>
              이 시술 후기{" "}
              <b className="text-[var(--primary)]">{reportLink.count}건</b> 보기
            </span>
            <span aria-hidden className="text-[var(--text-muted)]">
              →
            </span>
          </Link>
        </div>
      )}

      {/* 홈 피드와 동일한 단일열 PostCard 리스트(2열 Masonry → 단일열 feedList). */}
      <div className={betaStyles.feedList}>
        {posts.map((card) => (
          <PostCard key={card.id} card={card} />
        ))}
      </div>

      {count > PAGE_LIMIT && (
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          {PAGE_LIMIT}개 중 처음 {PAGE_LIMIT}개를 표시합니다. 더 보려면{" "}
          <Link
            href={`/search?q=${encodeURIComponent(tag)}`}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            검색 페이지
          </Link>
          를 이용해주세요.
        </p>
      )}
    </BetaSkinShell>
  );
}

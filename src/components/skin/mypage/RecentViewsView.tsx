"use client";

/**
 * RecentViewsView — /my/recent "최근 본 글" 본문 (클라이언트, 회원 전용).
 *
 * 마이 메인(/my)의 "최근 본 글" 스탯에서 진입. 서버(page.tsx)가 get_my_recent_views RPC 로
 *   카드 id 를 last_viewed_at DESC 순서로 받고, 그 순서를 보존해 cards 를 CARD_LIST_SELECT 로
 *   로드해 props 로 주입한다. 카드는 피드·공개 프로필과 동일한 PostCard 로 렌더(톤 일치).
 *
 * AppShell(active="마이", back="/my") 가 브랜드 헤더 + 하단 탭바 + 뒤로가기를 제공한다.
 * 비어 있으면(아직 본 글 없음) 빈 화면 + 둘러보기 링크.
 */

import Link from "next/link";
import type { CardData } from "@/lib/types/card";
import AppShell from "../AppShell";
import PolicyFooter from "../PolicyFooter";
import styles from "../app.module.css";
import { PostCard, useSearchRouting, type ViewerState } from "../ui";

export type RecentViewsProps = {
  /** last_viewed_at DESC 순서가 이미 보존된 카드 목록. 빈 배열이면 빈 화면. */
  cards: CardData[];
  /** 각 카드의 viewer 좋아요/저장 상태(서버 prefetch). */
  viewerStates?: Record<number, ViewerState>;
};

export default function RecentViewsView({ cards, viewerStates }: RecentViewsProps) {
  // 헤더 검색 → 피드로 라우팅(운영 공용 헬퍼) — 다른 스킨 페이지와 동일하게 AppShell 에 주입.
  const search = useSearchRouting();

  return (
    <AppShell active="마이" back="/my" backTitle="최근 본 글" {...search}>
      {cards.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            padding: "56px 16px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text, #2b3440)", margin: 0 }}>
            아직 본 글이 없어요
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            궁금한 피부 고민을 검색하거나 둘러보세요.
          </p>
          <Link
            href="/"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ marginTop: 4 }}
          >
            둘러보기
          </Link>
        </div>
      ) : (
        <div className={styles.feedList}>
          {cards.map((c) => (
            <PostCard
              key={c.id}
              card={c}
              viewer={viewerStates?.[c.id]}
              onTagClick={(t) => search.onSearchSubmit?.(t)}
            />
          ))}
        </div>
      )}

      <PolicyFooter />
    </AppShell>
  );
}

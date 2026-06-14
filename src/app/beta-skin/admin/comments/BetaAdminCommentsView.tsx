"use client";

/**
 * BetaAdminCommentsView — /beta-skin/admin/comments "전체 댓글" 본문 (클라이언트).
 *
 * 원칙(Phase 3 ②-b): UI 는 베타 스킨 톤(var(--ink-*) · var(--tt-blue*) · var(--line) 토큰),
 *   데이터·무한스크롤·복구 액션은 운영 /admin/comments 의 CommentsClient 를 그대로 재사용.
 *   - 서버(page.tsx)가 운영 admin/comments/page 의 가드·status 탭·doctor 본인 카드 강제필터·count +
 *     첫 페이지 prefetch 로직을 그대로 복제해 firstPage·hasMore·statusFilter·total 을 props 로 내려준다.
 *   - 이 컴포넌트는 BetaSkinShell + useBetaSearchRouting 안에 제목·status 탭(공개/비공개)을 베타 톤으로
 *     렌더하고, 그 아래에 운영 CommentsClient 를 그대로 임베드한다.
 *   - CommentsClient 가 무한스크롤(/api/admin/comments)·복구 액션(/api/comments/[id])을 자체 처리하므로
 *     로직 재구현 없이 그대로 사용(운영 Tailwind 톤은 그대로 임베드 — Phase3① ActivityKpis 방침).
 *   - searchParams 키(status)는 운영과 100% 동일 → 같은 URL 규약.
 *
 * 격리: 운영 파일 무수정. 베타 톤 영역은 인라인 style 의 베타 토큰만 사용(운영 var(--text)/var(--primary) 미사용).
 *   운영 컴포넌트(CommentsClient) 내부 Tailwind 톤은 그대로 임베드.
 */

import Link from "next/link";
import CommentsClient, {
  type CommentRow,
} from "@/app/admin/comments/CommentsClient";
import BetaSkinShell from "../../BetaSkinShell";
import { useBetaSearchRouting } from "../../beta-ui";
import styles from "../../beta-skin.module.css";

const BASE_PATH = "/beta-skin/admin/comments";

const STATUS_TABS: { key: "visible" | "hidden"; label: string }[] = [
  { key: "visible", label: "공개" },
  { key: "hidden", label: "비공개 (자동검수)" },
];

export type BetaAdminCommentsViewProps = {
  /** 서버 prefetch 한 첫 50개 댓글(운영 firstPage 그대로). */
  firstPage: CommentRow[];
  /** 첫 페이지 이후 더 있는지(운영 hasMore 그대로). */
  hasMore: boolean;
  /** 운영 status 탭 — visible(기본) / hidden(자동검수 큐). */
  statusFilter: "visible" | "hidden";
  /** 현재 탭의 총 댓글 수(서버 count). */
  total: number;
};

export default function BetaAdminCommentsView({
  firstPage,
  hasMore,
  statusFilter,
  total,
}: BetaAdminCommentsViewProps) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" {...search}>
      {/* 제목 + noindex 설명 */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div className={styles.profileName} style={{ marginBottom: 4 }}>
          전체 댓글
        </div>
        <p className={styles.muted}>
          {statusFilter === "hidden"
            ? `자동검수로 비공개 처리된 댓글 ${total.toLocaleString()}건 · 복구 시 visible 로 전환 (영구 noindex)`
            : `visible 상태 댓글 ${total.toLocaleString()}건 · 글 단위로 묶어 최신순 표시 (영구 noindex)`}
        </p>
      </section>

      {/* status 필터 탭 — 베타 톤(밑줄 강조). visible / hidden(자동검수). 운영 status 키 동일. */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <div
          style={{
            display: "flex",
            gap: 2,
            borderBottom: "1px solid var(--line)",
            overflowX: "auto",
          }}
        >
          {STATUS_TABS.map((t) => {
            const active = t.key === statusFilter;
            const href =
              t.key === "visible" ? BASE_PATH : `${BASE_PATH}?status=hidden`;
            return (
              <Link
                replace
                key={t.key}
                href={href}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  padding: "6px 12px",
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  color: active ? "var(--tt-blue-deep)" : "var(--ink-500)",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>{t.label}</span>
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "var(--tt-blue)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 운영 CommentsClient 임베드 — 무한스크롤(/api/admin/comments)·복구 액션(/api/comments/[id])
          자체 처리. firstPage·hasMore·statusFilter 만 props 로 전달(운영 admin/comments/page 와 동일 계약). */}
      <section className={`${styles.card} ${styles.mb20}`}>
        <CommentsClient
          initial={firstPage}
          initialHasMore={hasMore}
          statusFilter={statusFilter}
        />
      </section>
    </BetaSkinShell>
  );
}

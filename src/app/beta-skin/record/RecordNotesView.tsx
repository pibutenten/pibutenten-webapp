"use client";

/**
 * RecordNotesView — /record/notes "시술노트" 자세히 페이지 본문(클라이언트).
 *   날씨 상세(WeatherDetailView) 패턴 그대로: 공용 셸(BetaSkinShell, active="내 노트") 안에
 *   뒤로가기(/record) + 시술 노트 3토글 전체(RecordNotesPanel)를 렌더.
 *   데이터는 서버 page.tsx 가 운영 record-data(diaries → SummaryGroup[])로 조회해 props 로 주입.
 *   인라인 미리보기와 동일 컴포넌트(RecordNotesPanel)를 공유 — 여기선 슬라이스 없이 전체 entries.
 */

import { useMemo } from "react";
import Link from "next/link";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import RecordNotesPanel, { toRecEntries } from "./RecordNotesPanel";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";

export default function RecordNotesView({ summary }: { summary: SummaryGroup[] }) {
  const entries = useMemo(() => toRecEntries(summary), [summary]);

  return (
    <BetaSkinShell active="내 노트">
      <div className={styles.detailHead}>
        <Link href="/record" className={styles.detailBack} aria-label="내 노트로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className={styles.detailTitle}>시술노트</h1>
      </div>

      {entries.length === 0 ? (
        <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
          <p className={styles.muted}>아직 기록된 시술 노트가 없어요.</p>
          <Link
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
            href="/write"
            style={{ marginTop: 12 }}
          >
            첫 노트 쓰러 가기
          </Link>
        </section>
      ) : (
        <RecordNotesPanel entries={entries} />
      )}
    </BetaSkinShell>
  );
}

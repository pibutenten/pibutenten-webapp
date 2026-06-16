"use client";

/**
 * RecordNotesView — /notes "내 노트" 본문(클라이언트). 하단 1차 탭.
 *   공용 셸(BetaSkinShell, active="내 노트") 안에:
 *     제목 + KPI 3종(받은 시술·내가 쓴 노트·내가 쓴 후기)
 *     → 데이터 있으면 시술 노트 3토글(타임라인/달력/목록, RecordNotesPanel; 목록 뷰는 개별 접기/펼치기)
 *     → 비면 "이렇게 기록돼요" 예시(더미) + 첫 노트 CTA.
 *   데이터는 서버 page.tsx 가 운영 record-data(diaries → SummaryGroup[])로 조회해 props 로 주입.
 *   1차 탭이므로 뒤로가기 없음(서브 페이지였던 시절의 detailHead 제거).
 */

import { useMemo } from "react";
import Link from "next/link";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import RecordNotesPanel, { toRecEntries } from "./RecordNotesPanel";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";

/* "이렇게 기록돼요" 빈 상태용 샘플 노트(더미) — 실데이터 아님이 분명하도록 '예시' 배지와 함께 미리보기.
 *   날짜·병원·시술명·메모가 든 더미 카드 4개. 클릭 동작 없음(시각적 이해 전용). */
const SAMPLE_NOTES: {
  month: number;
  day: number;
  procs: string[];
  place: string;
  doctor: string;
  memo: string;
  badge: { label: string; tone: "mint" | "heal" };
}[] = [
  {
    month: 5,
    day: 12,
    procs: ["리프팅", "스킨부스터"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "시술 직후 약간 붉었지만 다음 날 가라앉음. 탄력 변화 관찰 중.",
    badge: { label: "효과 관찰 중", tone: "mint" },
  },
  {
    month: 4,
    day: 28,
    procs: ["레이저토닝", "스킨케어"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "색소·잡티 관리 목적. 시술 후 이틀간 살짝 따끔, 보습 신경 써서 관리.",
    badge: { label: "회복 중", tone: "heal" },
  },
  {
    month: 4,
    day: 3,
    procs: ["보톡스"],
    place: "○○의원",
    doctor: "○○○ 원장",
    memo: "이마 주름 부위. 일주일 뒤부터 효과 체감.",
    badge: { label: "회복 완료", tone: "mint" },
  },
  {
    month: 3,
    day: 15,
    procs: ["필러"],
    place: "○○피부과의원",
    doctor: "○○○ 원장",
    memo: "팔자 부위 볼륨. 시술 당일 약간 부었고 3일 뒤 자연스럽게 자리잡음.",
    badge: { label: "회복 완료", tone: "mint" },
  },
];

export default function RecordNotesView({
  summary,
  procedureCount,
  noteCount,
  reviewsCount,
}: {
  summary: SummaryGroup[];
  procedureCount: number;
  noteCount: number;
  reviewsCount: number;
}) {
  const entries = useMemo(() => toRecEntries(summary), [summary]);

  return (
    <BetaSkinShell active="내 노트">
      <h1 className="mb-3 text-[20px] font-bold text-[var(--text)]">내 노트</h1>

      {/* KPI 3종 — 받은 시술(시술 항목 총합) / 내가 쓴 노트 / 내가 쓴 후기 */}
      <section className={`${styles.card} ${styles.statCard} ${styles.mb20}`}>
        <div className={styles.statRow} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div>
            <div className={styles.num}>{procedureCount}</div>
            <div className={styles.lab}>받은 시술</div>
          </div>
          <div>
            <div className={styles.num}>{noteCount}</div>
            <div className={styles.lab}>내가 쓴 노트</div>
          </div>
          <div>
            <div className={styles.num}>{reviewsCount}</div>
            <div className={styles.lab}>내가 쓴 후기</div>
          </div>
        </div>
      </section>

      {entries.length === 0 ? (
        <>
          <div className={styles.recExampleHead}>
            <h2 className={styles.recNotesTitle}>이렇게 기록돼요</h2>
            <span className={styles.recExampleTag}>예시</span>
          </div>
          {/* 샘플 미리보기 — 실데이터 아님(더미)이 분명하도록 흐리게 + '예시' 배지. 클릭 동작 없음.
              타임라인 토큰(recTl*) 재사용 → "이렇게 기록된다"를 시각적으로 보여줌. */}
          <div className={styles.recExamplePreview} aria-hidden="true">
            <div className={styles.recTl}>
              {SAMPLE_NOTES.map((n, i) => (
                <div className={styles.recTlItem} key={i}>
                  <span className={styles.recTlDot}>
                    <span className={styles.recTlDotMonth}>{n.month}월</span>
                    <span className={styles.recTlDotDay}>{n.day}</span>
                  </span>
                  <div className={`${styles.card} ${styles.recTlCard}`}>
                    <div className={styles.recTlHead}>
                      <h3 className={styles.recTlName}>{n.procs.join(" · ")}</h3>
                      <span
                        className={`${styles.recBadge} ${n.badge.tone === "mint" ? styles.recBadgeMint : styles.recBadgeHeal}`}
                      >
                        {n.badge.label}
                      </span>
                    </div>
                    <div className={styles.recMeta}>
                      {n.place}
                      <span className={styles.sep}>·</span>
                      {n.doctor}
                    </div>
                    <p className={styles.recMemo}>{n.memo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <section className={`${styles.card} ${styles.sideCard}`} style={{ textAlign: "center" }}>
            <p className={styles.muted}>첫 노트를 쓰면 타임라인·달력·목록으로 한눈에 정리돼요.</p>
            <Link
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`}
              href="/write"
              style={{ marginTop: 12 }}
            >
              첫 노트 쓰러 가기
            </Link>
          </section>
        </>
      ) : (
        <RecordNotesPanel entries={entries} />
      )}
    </BetaSkinShell>
  );
}

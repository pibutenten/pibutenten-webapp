"use client";

/**
 * WriteView — /beta-skin/write "글쓰기" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="글쓰기" 로 사용. 폼은 자체 재구현(누더기) 폐기 →
 *   운영 `WriteTabs` 를 그대로 렌더(시술노트=DiaryForm / 시술후기=ReviewForm / 끄적끄적·Q&A=WriteClient).
 *   베타는 페이지 크롬(.wt 탭 카드 + 사이드바)만 제공하고, 선택한 탭을 WriteTabs 의 tab prop 으로 전달.
 *   Q&A 탭은 원장·관리자만 노출(canQa) — 운영 정합.
 */

import { useState } from "react";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { useBetaSearchRouting } from "../beta-ui";
import WriteTabs from "@/app/write/WriteTabs";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

/* 글 유형 탭 — 운영 WriteTabs 와 동일 구성. tab 값은 WriteTabs 가 해석(undefined=시술기록). */
const BASE_TYPES: { key: string; t: string; d: string; tab?: string }[] = [
  { key: "record", t: "시술노트", d: "나만 보는 기록", tab: undefined },
  { key: "review", t: "시술후기", d: "경험을 나눠요", tab: "review" },
  { key: "doodle", t: "끄적끄적", d: "자유롭게 적어요", tab: "doodle" },
];
const QA_TYPE = { key: "qa", t: "Q&A", d: "전문가 답변", tab: "qa" };

export default function WriteView({
  isLoggedIn = false,
  role = "user",
  displayName = "",
  handle = "",
  myDoctor = null,
  doctors = [],
  procedures = [],
}: {
  isLoggedIn?: boolean;
  role?: "admin" | "doctor" | "user";
  displayName?: string;
  handle?: string;
  myDoctor?: { slug: string; name: string } | null;
  doctors?: Doctor[];
  procedures?: ProcedureOption[];
}) {
  const search = useBetaSearchRouting();
  // Q&A 탭은 원장·관리자 전용(운영 정합).
  const canQa = isLoggedIn && (role === "admin" || role === "doctor");
  const types = canQa ? [...BASE_TYPES, QA_TYPE] : BASE_TYPES;
  const [active, setActive] = useState<string>("record");
  const activeTab = types.find((t) => t.key === active)?.tab;

  const sidebar = (
    <>
      <section
        className={`${styles.card} ${styles.sideCard}`}
        style={{ background: "var(--tt-blue-tint)" }}
      >
        <h3>좋은 기록 팁</h3>
        <div className={styles.sideList}>
          {[
            "시술명과 받은 날짜를 적어 주세요",
            "현재 증상이나 상태를 구체적으로",
            "기억하고 싶은 메모를 함께 남겨요",
          ].map((tip, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 10,
                padding: "9px 4px",
                fontSize: "13.5px",
                lineHeight: 1.45,
                color: "var(--ink-700)",
              }}
            >
              <span className={styles.n}>{i + 1}</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>안내</h3>
        <p className={styles.muted}>
          개인 식별이 가능한 정보는 가려서 올려 주세요. 답변은 일반적인 의학
          정보이며, 진단·처방은 내원 진료를 통해 받으실 수 있어요.
        </p>
      </section>
    </>
  );

  return (
    <BetaSkinShell active="글쓰기" sidebar={sidebar} {...search}>
      <div className={styles.writeWrap}>
        <div
          className={styles.writeTypes}
          style={{ gridTemplateColumns: `repeat(${types.length}, 1fr)` }}
        >
          {types.map((ty) => (
            <button
              type="button"
              key={ty.key}
              className={`${styles.wt} ${active === ty.key ? styles.wtActive : ""}`}
              onClick={() => setActive(ty.key)}
              aria-pressed={active === ty.key}
            >
              <div className={styles.wtT}>{ty.t}</div>
              <div className={styles.wtD}>{ty.d}</div>
            </button>
          ))}
        </div>

        {/* 운영 WriteTabs 그대로 — 자체 폼 미사용. key={active} 로 탭 전환 시 폼 리셋. */}
        <WriteTabs
          key={active}
          tab={activeTab}
          isLoggedIn={isLoggedIn}
          role={role}
          displayName={displayName}
          myDoctor={myDoctor}
          doctors={doctors}
          procedures={procedures}
          handle={handle}
        />
      </div>
    </BetaSkinShell>
  );
}

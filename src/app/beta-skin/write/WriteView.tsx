"use client";

/**
 * WriteView — /beta-skin/write "글쓰기" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="글쓰기" 로 사용.
 * 디자인 UI 전용: 글 유형 선택(로컬 useState), 제목·본문 입력(로컬 useState),
 * 태그 칩·사진 추가 버튼·등록 버튼은 표시만(제출 동작 없음).
 */

import { useState } from "react";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";

const TYPES = [
  { key: "qa", emoji: "💬", t: "Q&A 질문", d: "전문의가 답변해요" },
  { key: "review", emoji: "📝", t: "시술후기", d: "경험을 나눠요" },
  { key: "doodle", emoji: "☁️", t: "끄적끄적", d: "자유롭게 적어요" },
];

const TAG_CHIPS = [
  { label: "리프팅", tone: styles.chipBlue },
  { label: "스킨부스터", tone: styles.chipPink },
  { label: "색소·잡티", tone: styles.chipGreen },
  { label: "볼륨", tone: styles.chipPurple },
  { label: "모공·피지", tone: styles.chipYellow },
];

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export default function WriteView() {
  const [type, setType] = useState("qa");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const sidebar = (
    <>
      <section
        className={`${styles.card} ${styles.sideCard}`}
        style={{ background: "var(--tt-blue-tint)" }}
      >
        <h3>좋은 질문 작성 팁</h3>
        <div className={styles.sideList}>
          <a href="#">
            <span className={styles.n}>1</span>
            <span>시술명과 받은 날짜를 적어 주세요</span>
          </a>
          <a href="#">
            <span className={styles.n}>2</span>
            <span>현재 증상이나 상태를 구체적으로</span>
          </a>
          <a href="#">
            <span className={styles.n}>3</span>
            <span>사진을 첨부하면 답변이 더 정확해져요</span>
          </a>
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
    <BetaSkinShell active="글쓰기" sidebar={sidebar}>
      <div className={styles.writeWrap}>
        <div className={styles.sectionHead} style={{ marginTop: 8 }}>
          <h2>글쓰기</h2>
          <span className={styles.more}>임시저장 2</span>
        </div>

        <div className={styles.writeTypes}>
          {TYPES.map((ty) => (
            <button
              type="button"
              key={ty.key}
              className={`${styles.wt} ${type === ty.key ? styles.wtActive : ""}`}
              onClick={() => setType(ty.key)}
              aria-pressed={type === ty.key}
            >
              <div className={styles.emoji}>{ty.emoji}</div>
              <div className={styles.wtT}>{ty.t}</div>
              <div className={styles.wtD}>{ty.d}</div>
            </button>
          ))}
        </div>

        <div className={styles.field}>
          <label htmlFor="w-title">제목</label>
          <input
            id="w-title"
            className={styles.input}
            type="text"
            placeholder="궁금한 점을 한 문장으로 적어 주세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="w-body">내용</label>
          <textarea
            id="w-body"
            className={styles.textarea}
            placeholder="시술명, 받은 시기, 현재 상태를 함께 적어 주시면 더 정확한 답변을 받을 수 있어요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>관련 태그</label>
          <div className={styles.chipRow}>
            {TAG_CHIPS.map((c) => (
              <span className={`${styles.chip} ${c.tone}`} key={c.label}>
                {c.label}
              </span>
            ))}
            <span className={styles.chip}>+ 직접 입력</span>
          </div>
        </div>

        <div className={styles.field}>
          <label>사진 (선택)</label>
          <button type="button" className={styles.photoAdd}>
            <IconCamera />
            0/5
          </button>
        </div>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnSolid} ${styles.writeSubmit}`}
        >
          등록하기
        </button>
      </div>
    </BetaSkinShell>
  );
}

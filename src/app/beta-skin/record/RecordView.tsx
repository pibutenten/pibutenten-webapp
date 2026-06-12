"use client";

/**
 * RecordView — /beta-skin/record "내 노트" 본문 (클라이언트).
 *
 * 공용 셸(BetaSkinShell)을 active="내 노트" 로 사용.
 * - 인사 카드 / 시술 타임라인 / 사이드바: 샘플(로그인 필요 데이터라 예시).
 * - 관심 키워드 칩: 실데이터(props.keywordChips) 우선, 비면 샘플 폴백.
 * - 관심 키워드 새 글 카드: 실데이터(props.kwCards) qa 카드, 비면 샘플 폴백.
 */

import Link from "next/link";
import CardAvatar from "@/components/card/CardAvatar";
import type { CardData } from "@/lib/types/card";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";
import { IconVerified, timeAgo } from "../beta-ui";

const SAMPLE_CHIPS = ["리프팅", "보톡스", "스킨부스터", "볼륨", "더모코스메틱"];

/* 샘플 시술 타임라인 (로그인 필요 데이터 → 예시) */
const TIMELINE = [
  {
    dot: styles.dotPink,
    date: "2026. 6. 12",
    name: "리쥬란 힐러",
    tag: "피부결 개선",
    tagTone: styles.tagPink,
    place: "힐하우스피부과의원",
    doctor: "정한미 원장님",
  },
  {
    dot: styles.dotBlue,
    date: "2026. 5. 12",
    name: "인모드 FX",
    tag: "피부 탄력",
    tagTone: styles.tagBlue,
    place: "힐하우스피부과의원",
    doctor: "정한미 원장님",
  },
  {
    dot: styles.dotGreen,
    date: "2026. 4. 28",
    name: "피코레이저",
    tag: "색소·잡티 개선",
    tagTone: styles.tagGreen,
    place: "힐하우스피부과의원",
    doctor: "정한미 원장님",
  },
];

/* 키워드 카드 샘플 폴백 */
const SAMPLE_KW_CARDS = [
  {
    tag: "리프팅",
    tagTone: styles.tagBlue,
    title: "리프팅 받았는데 효과 없는 사람은 왜 그런 건가요?",
    author: "이도영",
    when: "1달 전",
  },
  {
    tag: "스킨부스터",
    tagTone: styles.tagPink,
    title: "리쥬란이랑 쥬브젠, 둘 중 뭐가 더 오래가나요?",
    author: "정한미",
    when: "2주 전",
  },
];

const KW_TONES = [
  styles.tagBlue,
  styles.tagPink,
  styles.tagGreen,
  styles.tagPurple,
];

export default function RecordView({
  kwCards,
  keywordChips,
}: {
  kwCards: CardData[];
  keywordChips: string[];
}) {
  const chips = keywordChips.length >= 3 ? keywordChips : SAMPLE_CHIPS;

  const sidebar = (
    <>
      <section className={`${styles.card} ${styles.sideEmoji}`}>
        <h3>다가오는 일정</h3>
        <div className={styles.sideList}>
          <a href="#">
            <span aria-hidden="true">💉</span>
            <span>
              <b>써마지 경과 노트</b> 작성 권장일이 내일이에요
            </span>
          </a>
          <a href="#">
            <span aria-hidden="true">📅</span>
            <span>피코레이저 2회차 — 6. 26 (금)</span>
          </a>
        </div>
      </section>

      <section className={`${styles.card} ${styles.sideCard}`}>
        <h3>지금 많이 보는 Q&A</h3>
        <div className={styles.sideList}>
          <a href="/beta-skin/post">
            <span className={styles.n}>1</span>
            <span>쥬브젠 시술 후 다운타임은 어떤가요?</span>
          </a>
          <a href="/beta-skin/post">
            <span className={styles.n}>2</span>
            <span>올타이트 리프팅이 통증 없이 가능한 이유</span>
          </a>
          <a href="/beta-skin/post">
            <span className={styles.n}>3</span>
            <span>리쥬란 직후 세안, 언제부터 가능할까요?</span>
          </a>
        </div>
      </section>
    </>
  );

  return (
    <BetaSkinShell active="내 노트" sidebar={sidebar}>
      {/* 인사 카드 (샘플) */}
      <section className={`${styles.card} ${styles.greetCard}`}>
        <div className={styles.greetTop}>
          안녕하세요, 텐즈님! <span className="chev">›</span>
        </div>
        <h1 className={styles.greetTitle}>
          써마지 시술 3일차,
          <br />
          회복은 잘 되고 있나요?
        </h1>
        <div className={styles.greetActions}>
          <a className={`${styles.btn} ${styles.btnGhost}`} href="#">
            내 시술 노트
          </a>
          <a
            className={`${styles.btn} ${styles.btnPrimary}`}
            href="/beta-skin/write"
          >
            노트 기록하기
          </a>
        </div>
      </section>

      {/* 시술 타임라인 (샘플) */}
      <div className={styles.sectionHead}>
        <h2>내 시술 타임라인</h2>
        <a className={styles.more} href="#">
          더 보기 ›
        </a>
      </div>
      <div className={styles.timeline}>
        {TIMELINE.map((t) => (
          <div className={styles.tlItem} key={t.date}>
            <span className={`${styles.dot} ${t.dot}`} />
            <div className={`${styles.card} ${styles.tlCard}`}>
              <div className={styles.tlDate}>{t.date}</div>
              <div className={styles.tlName}>
                {t.name}
                <span className={`${styles.tag} ${t.tagTone}`}>{t.tag}</span>
              </div>
              <div className={styles.tlMeta}>
                {t.place}
                <span className={styles.sep}>|</span>
                {t.doctor}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 관심 키워드 새 글 */}
      <div className={styles.sectionHead}>
        <h2>관심 키워드 새 글</h2>
        <a className={styles.more} href="#">
          키워드 편집
        </a>
      </div>
      {/* 관심 키워드 칩 — 클릭 시 피드로 이동해 그 키워드로 검색·필터(?kw=).
          항목 4) # 표기 금지 — 키워드만 표시. */}
      <div className={styles.chipRow}>
        {chips.map((c) => (
          <Link
            className={`${styles.chip} ${styles.chipNav}`}
            key={c}
            href={`/beta-skin?kw=${encodeURIComponent(c)}`}
          >
            {c}
          </Link>
        ))}
      </div>

      <div className={styles.kwScroll}>
        {kwCards.length >= 2
          ? kwCards.map((c, i) => {
              const author =
                c.doctor?.name ?? c.author?.display_name ?? "회원";
              const isDoctor = !!c.doctor && !c.hide_doctor_credential;
              const kw = c.keywords?.[0] ?? "키워드";
              return (
                <a
                  className={`${styles.card} ${styles.kwCard}`}
                  href="/beta-skin/post"
                  key={c.id}
                >
                  <span
                    className={`${styles.tag} ${KW_TONES[i % KW_TONES.length]}`}
                  >
                    {kw}
                  </span>
                  <h3 className={styles.kwTitle}>{c.title}</h3>
                  <div className={styles.kwFoot}>
                    <CardAvatar
                      doctorSlug={c.doctor?.slug}
                      memberAvatarUrl={c.author?.avatar_url}
                      name={author}
                      size={36}
                    />
                    <div>
                      <div className={styles.authorName} style={{ fontSize: 14 }}>
                        {author}
                        {isDoctor && (
                          <span className={styles.verified}>
                            <IconVerified />
                          </span>
                        )}
                      </div>
                      <div className={styles.authorSub}>
                        {isDoctor ? "피부과 전문의" : "회원"}
                      </div>
                    </div>
                    <span className={styles.when}>
                      {timeAgo(c.created_at) || "최근"}
                    </span>
                  </div>
                </a>
              );
            })
          : SAMPLE_KW_CARDS.map((c) => (
              <a
                className={`${styles.card} ${styles.kwCard}`}
                href="/beta-skin/post"
                key={c.title}
              >
                <span className={`${styles.tag} ${c.tagTone}`}>{c.tag}</span>
                <h3 className={styles.kwTitle}>{c.title}</h3>
                <div className={styles.kwFoot}>
                  <span className={`${styles.avatar} ${styles.avatarGray}`} />
                  <div>
                    <div className={styles.authorName} style={{ fontSize: 14 }}>
                      {c.author}
                      <span className={styles.verified}>
                        <IconVerified />
                      </span>
                    </div>
                    <div className={styles.authorSub}>피부과 전문의</div>
                  </div>
                  <span className={styles.when}>{c.when}</span>
                </div>
              </a>
            ))}
      </div>
    </BetaSkinShell>
  );
}

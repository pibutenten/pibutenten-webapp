"use client";

/**
 * BetaSkinFeed — /beta-skin 신규 스킨 프리뷰 (클라이언트 루트).
 *
 * 격리 방식:
 *   - 최상위 div(styles.root)가 position:fixed; inset:0; z-index:100; overflow-y:auto
 *     풀뷰포트 오버레이 → 루트 layout.tsx 의 TopNav/SiteFooter/main 을 시각적으로 가린다.
 *   - 모든 스타일은 CSS Module(beta-skin.module.css)로 스코프. globals.css 토큰 비의존.
 *
 * 데이터: 서버(page.tsx)에서 feed_cards_scored 로 받은 CardData[] 를 prop 으로 받아
 *   카테고리 칩으로 클라 필터(useState)만 수행. 서버 왕복 없음.
 */

import { useMemo, useState } from "react";
import type { CardData } from "@/lib/types/card";
import styles from "./beta-skin.module.css";

/* ---------- 카드 → 상세 링크 ---------- */
function cardHref(c: CardData): string {
  if (c.doctor?.slug && c.post_year && c.post_slug) {
    return `/doctors/${c.doctor.slug}/${c.post_year}/${c.post_slug}`;
  }
  if (c.shortcode && c.author?.handle) {
    return `/${c.author.handle}/${c.shortcode}`;
  }
  return "#";
}

/* ---------- 카테고리 라벨 ---------- */
function categoryLabel(c: CardData): string {
  const key = c.category ?? c.type ?? "";
  switch (key) {
    case "qa":
      return "Q&A";
    case "review":
      return "시술후기";
    case "doodle":
      return "끄적끄적";
    case "review_summary":
      return "리포트";
    case "post":
      return "글";
    default:
      return "글";
  }
}

/* ---------- 상대 시간 ---------- */
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < day) return "오늘";
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}주 전`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}개월 전`;
  return `${Math.floor(diff / (365 * day))}년 전`;
}

/* ---------- 칩 정의 (전체 + 4종) ---------- */
type ChipKey = "all" | "qa" | "review" | "doodle" | "review_summary";
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "qa", label: "Q&A" },
  { key: "review", label: "시술후기" },
  { key: "doodle", label: "끄적끄적" },
  { key: "review_summary", label: "리포트" },
];

function matchesChip(c: CardData, chip: ChipKey): boolean {
  if (chip === "all") return true;
  const key = c.category ?? c.type ?? "";
  return key === chip;
}

/* ---------- 인라인 SVG 아이콘 ---------- */
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}
function IconComment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    </svg>
  );
}
function IconBookmark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 3h12v18l-6-4-6 4Z" />
    </svg>
  );
}
function IconVerified() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.7 9 4H5v4l-2.6 3L5 14v4h4l3 2.3L15 18h4v-4l2.6-3L19 8V4h-4l-3-2.3Zm-1.2 13.4-3-3 1.4-1.4 1.6 1.6 4-4 1.4 1.4-5.4 5.4Z" />
    </svg>
  );
}
/* 탭바 아이콘 */
function IconNote() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2zM22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" />
    </svg>
  );
}
function IconWrite() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconFeed() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}
function IconShop() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 7h12l1 13H5L6 7Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </svg>
  );
}

/* 사이드바 인기 태그 5색 순환 */
const TAG_TONES = [
  styles.tagBlue,
  styles.tagPink,
  styles.tagPurple,
  styles.tagGreen,
  styles.tagYellow,
];

/* ---------- 개별 피드 카드 ---------- */
function PostCard({ card }: { card: CardData }) {
  const href = cardHref(card);
  const authorName =
    card.doctor?.name ?? card.author?.display_name ?? "회원";
  const isDoctor = !!card.doctor && !card.hide_doctor_credential;
  const avatarUrl = card.author?.avatar_url ?? null;
  const tags = (card.keywords ?? []).slice(0, 7);

  return (
    <article className={`${styles.card} ${styles.postCard}`}>
      <a className={styles.author} href={href}>
        <span
          className={`${styles.avatar} ${isDoctor ? "" : styles.avatarGray}`}
          style={
            avatarUrl
              ? { backgroundImage: `url(${avatarUrl})` }
              : undefined
          }
          aria-hidden="true"
        />
        <div>
          <div className={styles.authorName}>
            {authorName}
            {isDoctor && (
              <span className={styles.verified}>
                <IconVerified />
                피부과 전문의
              </span>
            )}
          </div>
          <div className={styles.authorSub}>
            <span className={styles.catLabel}>{categoryLabel(card)}</span>
            {timeAgo(card.created_at) ? ` · ${timeAgo(card.created_at)}` : ""}
          </div>
        </div>
      </a>

      <a href={href}>
        <h2 className={styles.postTitle}>{card.title}</h2>
        {card.body && <p className={styles.postBody}>{card.body}</p>}
      </a>

      {card.video?.youtube_url && (
        <a className={styles.ytPill} href={href}>
          <span className={styles.ytMark} aria-hidden="true" />
          영상 보러가기
        </a>
      )}

      {tags.length > 0 && (
        <div className={styles.postTags}>
          {tags.map((t) => (
            <span className={styles.t} key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className={styles.postFoot}>
        <span className={styles.pf}>
          <IconHeart /> {card.like_count ?? 0}
        </span>
        <span className={styles.pf}>
          <IconComment /> {card.comment_count ?? 0}
        </span>
        <span className={styles.pf}>
          <IconBookmark /> {card.save_count ?? 0}
        </span>
        <span className={styles.grow} />
      </div>
    </article>
  );
}

/* ---------- 클라이언트 루트 ---------- */
export default function BetaSkinFeed({
  initialPool,
}: {
  initialPool: CardData[];
}) {
  const [chip, setChip] = useState<ChipKey>("all");

  const filtered = useMemo(
    () => initialPool.filter((c) => matchesChip(c, chip)),
    [initialPool, chip],
  );

  // 인기 태그: 전체 풀 keywords 빈도 상위 8개
  const popularTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of initialPool) {
      for (const k of c.keywords ?? []) {
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
  }, [initialPool]);

  // 이번 주 전문의 답변: doctor 글(Q&A) 제목 상위 5개
  const doctorAnswers = useMemo(
    () =>
      initialPool
        .filter((c) => !!c.doctor && (c.category ?? c.type) === "qa")
        .slice(0, 5),
    [initialPool],
  );

  return (
    <div className={styles.root}>
      {/* ---------- 헤더 ---------- */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logoLink} href="/beta-skin" aria-label="피부텐텐">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logoImg}
              src="/brand-logo.svg"
              alt="피부텐텐"
            />
          </a>
          <nav className={styles.gnb}>
            <a href="#">내 노트</a>
            <a className={styles.gnbActive} href="#">
              피드
            </a>
            <a href="#">쇼핑</a>
          </nav>
          <div className={styles.headerSpacer} />
          <div className={styles.headerSearch}>
            <IconSearch />
            시술·고민 키워드 검색
          </div>
          <a className={styles.btnWriteTop} href="#">
            <IconPlus />
            글쓰기
          </a>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnSearch}`}
            aria-label="검색"
            type="button"
          >
            <IconSearch />
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnBell}`}
            aria-label="알림"
            type="button"
          >
            <IconBell />
          </button>
        </div>
      </header>

      {/* ---------- 본문 ---------- */}
      <main className={styles.page}>
        <div className={styles.chipRow}>
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`${styles.chip} ${
                chip === c.key ? styles.chipActive : ""
              }`}
              onClick={() => setChip(c.key)}
              aria-pressed={chip === c.key}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className={styles.layout}>
          <div className={styles.feedList}>
            {filtered.length === 0 ? (
              <p className={styles.empty}>이 카테고리에 표시할 글이 없습니다.</p>
            ) : (
              filtered.map((card) => <PostCard key={card.id} card={card} />)
            )}
          </div>

          {/* ---------- 데스크탑 사이드바 ---------- */}
          <aside className={styles.sidebar}>
            <section className={`${styles.card} ${styles.sideCard}`}>
              <h3>인기 태그</h3>
              <div className={styles.sideTags}>
                {popularTags.map((tag, i) => (
                  <span
                    className={`${styles.tag} ${TAG_TONES[i % TAG_TONES.length]}`}
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            <section className={`${styles.card} ${styles.sideCard}`}>
              <h3>이번 주 전문의 답변</h3>
              <div className={styles.sideList}>
                {doctorAnswers.map((c) => (
                  <a key={c.id} href={cardHref(c)}>
                    <span className={styles.n}>Q</span>
                    <span>{c.title}</span>
                  </a>
                ))}
              </div>
            </section>

            <section className={`${styles.card} ${styles.sideCta}`}>
              <h3>궁금한 시술이 있나요?</h3>
              <p>피부과 전문의가 직접 답변해 드려요.</p>
              <a className={styles.sideCtaBtn} href="#">
                질문 올리기
              </a>
            </section>
          </aside>
        </div>
      </main>

      {/* ---------- 하단 둥근 탭바 (모바일) ---------- */}
      <nav className={styles.tabbar}>
        <a className={styles.tab} href="#">
          <IconNote />
          내 노트
        </a>
        <a className={styles.tab} href="#">
          <IconWrite />
          글쓰기
        </a>
        <a className={`${styles.tab} ${styles.tabActive}`} href="#">
          <IconFeed />
          피드
        </a>
        <a className={styles.tab} href="#">
          <IconShop />
          쇼핑
        </a>
        <a className={styles.tab} href="#">
          <IconUser />
          마이
        </a>
      </nav>
    </div>
  );
}

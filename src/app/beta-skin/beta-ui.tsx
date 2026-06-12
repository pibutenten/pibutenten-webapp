"use client";

/**
 * beta-ui — /beta-skin/* 프리뷰 공용 카드 UI · 헬퍼 · 인라인 아이콘.
 *
 * 피드(BetaSkinFeed)·글 상세(PostDetail)·내 노트(record) 등 여러 페이지가
 * 같은 카드 컴포넌트/아이콘/링크 헬퍼를 재사용하도록 한 곳에 모음 (DRY).
 *
 * 운영 동작 이식 (읽기만, 직접 재사용/재현):
 *   - 아바타: 운영 CardAvatar 를 그대로 import (getDoctorPhoto/Theme 보정 → 얼굴 안 잘림).
 *   - 본문 볼드·형광펜: pickHighlight(card id) 로 카드별 색 결정 + **bold** → strong + 형광펜
 *     (운영 renderAnswerBody 의 linear-gradient(transparent 60%, color 60%) 방식 재현).
 *   - 영상 pill 타임스탬프: external_url(youtube t/start) → 없으면 video.youtube_url 에서 mm:ss.
 */

import { Fragment, useState, type ReactNode } from "react";
import CardAvatar from "@/components/card/CardAvatar";
import { pickHighlight } from "@/lib/card-highlight";
import { getQaUrl } from "@/lib/card-url";
import { parseYoutubeTimestamp, formatTimestamp } from "@/lib/youtube-time";
import type { CardData } from "@/lib/types/card";
import styles from "./beta-skin.module.css";

/* ---------- 카드 → 실제 운영 URL ----------
 * 항목 1) 모든 카드를 한 데모(/beta-skin/post)로 보내던 버그 수정.
 *   - 카드별 실제 canonical URL 을 생성(운영 getQaUrl 재사용):
 *       의사 글: /doctors/{slug}/{year}/{post-slug}
 *       회원 글: /{handle}/{shortcode}
 *   - '원문 보기' 링크가 이 URL 로 새 탭 이동. 본문 펼침/접힘은 인라인(아래 PostCard).
 *   - URL 정보가 부족하면 "/"(홈) 반환 → 호출부에서 링크 자체를 숨긴다. */
export function cardHref(c: CardData): string {
  return getQaUrl(c);
}

/* ---------- 카드 → 작성자 프로필 URL (운영 CardHeader 동선 재현) ----------
 * 항목 4) 작성자(아바타+이름) 클릭 → 실제 프로필로 이동.
 *   - 의사(credential 노출): /doctors/{slug}
 *   - 회원(handle 있음):     /{handle}
 *   - 정보 부족: null → 호출부에서 링크 대신 일반 텍스트로 렌더. */
export function authorHref(c: CardData): string | null {
  const isDoctor = !!c.doctor && !c.hide_doctor_credential;
  if (isDoctor && c.doctor?.slug) return `/doctors/${c.doctor.slug}`;
  if (c.author?.handle) return `/${c.author.handle}`;
  return null;
}

/* ---------- 24시간 내 작성 → NEW (운영 Card.isNew 재현) ----------
 * 항목 5) created_at 이 24h 이내면 NEW 배지. created_at 없으면 false. */
export function isNewCard(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

/* ---------- 공유 (실제 URL, 운영 shareCard 의 프리뷰판) ----------
 * 항목 5) navigator.share 있으면 호출, 없으면 clipboard 복사 + alert 안내.
 *   href 는 cardHref 결과(상대경로) → 절대 URL 로 변환해 공유/복사.
 *   "/"(정보 부족) 이면 현재 페이지 URL 로 폴백. */
export async function shareBetaCard(href: string, title?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const url =
    href && href !== "/"
      ? new URL(href, window.location.origin).toString()
      : window.location.href;
  try {
    const nav = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      await nav.share({ title: title || "피부텐텐", url });
      return;
    }
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(url);
      window.alert("링크를 복사했어요.");
      return;
    }
    window.prompt("아래 링크를 복사하세요", url);
  } catch {
    /* 사용자가 공유 시트를 닫은 경우 등 — 조용히 무시 */
  }
}

/* ---------- 카테고리 라벨 ---------- */
export function categoryLabel(c: CardData): string {
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
export function timeAgo(iso?: string | null): string {
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

/* ---------- 참고문헌 (운영 CardBody 의 pubmed_refs 섹션 재현) ----------
 * card.pubmed_refs(PubmedRef[]) 중 pmid 또는 doi 가 있는 ref 만 표시.
 * 제목(링크) + 저자·저널·연도 메타를 한 텍스트 흐름으로. 운영과 동일 수준.
 * 카드 펼침(expanded) 시에만 노출하도록 호출부에서 제어. */
export function PubmedRefs({ card }: { card: CardData }) {
  const refs = card.pubmed_refs ?? [];
  const valid = refs.filter((r) => r.pmid || r.doi);
  if (valid.length === 0) return null;
  return (
    <div className={styles.refs} onClick={(e) => e.stopPropagation()}>
      <div className={styles.refsHead}>
        참고문헌{valid.length > 1 ? ` (${valid.length})` : ""}
      </div>
      <ul className={styles.refsList}>
        {valid.map((r, idx) => {
          const href = r.pubmed_url || r.doi_url || null;
          const titleText =
            typeof r.title === "string" && r.title.trim()
              ? r.title
              : "(제목 없음)";
          const hasMeta = !!(r.authors_short || r.journal || r.year);
          return (
            <li key={`${r.pmid ?? r.doi ?? idx}-${idx}`}>
              {valid.length > 1 && (
                <span className={styles.refsNum}>{idx + 1}.</span>
              )}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.refsLink}
                >
                  {titleText}
                </a>
              ) : (
                <span>{titleText}</span>
              )}
              {hasMeta && (
                <span className={styles.refsMeta}>
                  {" "}
                  {r.authors_short && <span>{r.authors_short}</span>}
                  {r.journal && (
                    <>
                      {r.authors_short ? ", " : ""}
                      <span>{r.journal}</span>
                    </>
                  )}
                  {r.year && (
                    <>
                      {r.authors_short || r.journal ? " " : ""}
                      {"("}
                      <span>{r.year}</span>
                      {")"}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- 영상 타임스탬프 추출 (운영 CardMedia 재현) ----------
 * Q&A + external_url(youtube) 우선 → 없으면 video.youtube_url. t/start 초 → mm:ss. */
const YOUTUBE_HOST_RE = /(?:youtu\.be|youtube\.com|youtube-nocookie\.com)/;
export function videoInfo(card: CardData): { href: string; ts: string | null } | null {
  const isQa = (card.category ?? card.type) === "qa";
  const ext = card.external_url ?? null;
  const isYoutubeExt = !!ext && YOUTUBE_HOST_RE.test(ext);
  const href = isQa && isYoutubeExt ? ext : (card.video?.youtube_url ?? null);
  if (!href) return null;
  const sec = parseYoutubeTimestamp(href);
  return { href, ts: sec !== null ? formatTimestamp(sec) : null };
}

/* ---------- 본문 볼드·형광펜 렌더 (운영 renderAnswerBody 재현) ----------
 * 단락(\n\n) 분리 → <p>. **bold** → <strong> + 형광펜(linear-gradient transparent 60% → color 60%).
 * highlightColor 는 pickHighlight(card.id) 로 카드별 결정. clamped=true 면 첫 단락만 보이고 나머지 hidden. */
export function renderBetaBody(
  text: string,
  highlightColor: string,
  clamped: boolean,
): ReactNode {
  const paragraphs = (text ?? "").split(/\n{2,}/).map((s) => s.trimEnd());
  return (
    <>
      {paragraphs.map((para, pi) => {
        const isFirst = pi === 0;
        const inline: ReactNode[] = [];
        const re = /\*\*([^*]+)\*\*/g;
        let lastIdx = 0;
        let m: RegExpExecArray | null;
        let key = 0;
        while ((m = re.exec(para)) !== null) {
          if (m.index > lastIdx) {
            inline.push(
              <Fragment key={`t${pi}-${key++}`}>
                {para.slice(lastIdx, m.index)}
              </Fragment>,
            );
          }
          inline.push(
            <strong
              key={`b${pi}-${key++}`}
              className={styles.bodyBold}
              style={{
                backgroundImage: `linear-gradient(transparent 60%, ${highlightColor} 60%)`,
              }}
            >
              {m[1]}
            </strong>,
          );
          lastIdx = m.index + m[0].length;
        }
        if (lastIdx < para.length) {
          inline.push(
            <Fragment key={`t${pi}-${key++}`}>{para.slice(lastIdx)}</Fragment>,
          );
        }
        const cls = [
          styles.bodyPara,
          clamped && isFirst ? styles.bodyClamp : "",
          clamped && !isFirst ? styles.bodyHidden : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <p key={pi} className={cls}>
            {inline}
          </p>
        );
      })}
    </>
  );
}

/* ---------- 인라인 SVG 아이콘 ---------- */
export function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}
export function IconComment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    </svg>
  );
}
export function IconBookmark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 3h12v18l-6-4-6 4Z" />
    </svg>
  );
}
export function IconShare() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v7h14v-7" />
    </svg>
  );
}
export function IconVerified() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.7 9 4H5v4l-2.6 3L5 14v4h4l3 2.3L15 18h4v-4l2.6-3L19 8V4h-4l-3-2.3Zm-1.2 13.4-3-3 1.4-1.4 1.6 1.6 4-4 1.4 1.4-5.4 5.4Z" />
    </svg>
  );
}

/* 5색 태그 톤 순환 */
export const TAG_TONES = [
  styles.tagBlue,
  styles.tagPink,
  styles.tagPurple,
  styles.tagGreen,
  styles.tagYellow,
];

/* ---------- 개별 피드 카드 (인라인 펼침/접힘) ----------
 * 운영 방식 이식: 클릭 시 단일 URL 이동이 아니라 그 자리서 본문 펼침/접힘.
 *   - 항목 1) 모든 카드를 한 데모로 보내던 Link/onClick 제거.
 *       카드 클릭(제목/본문) = per-card expanded 토글만. 작성자도 토글(이동 X).
 *       대신 절제된 '원문 보기' 링크 하나가 그 카드의 실제 URL 로 새 탭 이동.
 *   - 기본: 본문 4줄 클램프 + 태그 7개. 펼침: 전체 본문 + 전체 태그.
 *   - 항목 3) '더보기/접기' 라벨은 muted 회색·일반 굵기·작게(절제).
 *   - 항목 4) 태그 클릭 → onTagClick(키워드) 로 헤더 검색창에 채워 필터.
 *   - 아바타는 운영 CardAvatar 로 교체(원장 얼굴 보정). */
export function PostCard({
  card,
  onTagClick,
}: {
  card: CardData;
  /** 항목 4) 카드 태그 클릭 → 그 키워드로 검색·필터 (헤더 검색창에 채움). */
  onTagClick?: (keyword: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const authorName = card.doctor?.name ?? card.author?.display_name ?? "회원";
  const isDoctor = !!card.doctor && !card.hide_doctor_credential;
  const allTags = card.keywords ?? [];
  const tags = expanded ? allTags : allTags.slice(0, 7);
  const body = card.body ?? "";
  const isLong = body.length > 120 || body.split(/\n{2,}/).length > 1;
  const hlColor = pickHighlight(String(card.id));
  const vid = videoInfo(card);
  // 항목 1) 실제 canonical URL. "/"(정보 부족) 이면 '원문 보기' 링크 숨김.
  const href = cardHref(card);
  const hasHref = href !== "/";
  // 항목 4) 작성자 프로필 URL. null 이면 링크 대신 일반 div.
  const profileHref = authorHref(card);
  // 항목 5) 24h 내 작성 → NEW 배지.
  const showNew = isNewCard(card.created_at);

  const toggle = () => {
    if (isLong) setExpanded((v) => !v);
  };

  // 작성자 행 내용 — 링크/일반 div 공용.
  const authorInner = (
    <>
      <CardAvatar
        doctorSlug={card.doctor?.slug}
        memberAvatarUrl={card.author?.avatar_url}
        name={authorName}
        size={46}
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
    </>
  );

  return (
    <article className={`${styles.card} ${styles.postCard}`}>
      {/* 항목 5) NEW 배지 — 24h 내 작성. 카드 우상단 안쪽에서 매달림. */}
      {showNew && <span className={styles.newBadge}>NEW</span>}

      {/* 작성자 — 항목 4) 실제 프로필 URL 로 새 탭 이동(정보 부족이면 일반 div).
          본문 펼침 토글과 충돌 안 나게 작성자 영역은 별도(토글에서 분리). */}
      {profileHref ? (
        <a
          className={styles.author}
          href={profileHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {authorInner}
        </a>
      ) : (
        <div className={styles.author}>{authorInner}</div>
      )}

      <div
        className={isLong ? styles.bodyToggle : undefined}
        onClick={toggle}
        role={isLong ? "button" : undefined}
        tabIndex={isLong ? 0 : undefined}
        onKeyDown={
          isLong
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        <h2 className={styles.postTitle}>{card.title}</h2>
        {body && (
          <div className={styles.postBodyRich}>
            {renderBetaBody(body, hlColor, isLong && !expanded)}
          </div>
        )}
        {isLong && (
          <span className={styles.moreToggle}>
            {expanded ? "접기" : "더보기"}
          </span>
        )}
        {/* 참고문헌 — 펼침 시(또는 짧은 글이라 항상 보일 때) 노출. 운영 CardBody 정합. */}
        {(!isLong || expanded) && <PubmedRefs card={card} />}
      </div>

      {vid && (
        <a
          className={styles.ytPill}
          href={vid.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <span className={styles.ytMark} aria-hidden="true" />
          영상 보러가기{vid.ts ? ` ${vid.ts}~` : ""}
        </a>
      )}

      {tags.length > 0 && (
        <div className={styles.postTags}>
          {tags.map((t) =>
            onTagClick ? (
              <button
                type="button"
                className={styles.t}
                key={t}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(t);
                }}
              >
                {t}
              </button>
            ) : (
              <span className={styles.t} key={t}>
                {t}
              </span>
            ),
          )}
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
        {/* 항목 5) 공유 — 실제 URL 을 navigator.share / clipboard 로. */}
        <button
          type="button"
          className={styles.pfBtn}
          aria-label="공유"
          onClick={(e) => {
            e.stopPropagation();
            void shareBetaCard(href, card.title ?? undefined);
          }}
        >
          <IconShare />
        </button>
        <span className={styles.grow} />
        {/* 항목 1) 절제된 '원문 보기' — 카드별 실제 URL 로 새 탭. (전체 카드 동일 이동 X) */}
        {hasHref && (
          <a
            className={styles.cardSource}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            원문 보기
          </a>
        )}
      </div>
    </article>
  );
}

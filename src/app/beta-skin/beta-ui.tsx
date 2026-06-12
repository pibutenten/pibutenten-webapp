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
import { useRouter } from "next/navigation";
import CardAvatar from "@/components/card/CardAvatar";
import { pickHighlight } from "@/lib/card-highlight";
import { getQaUrl } from "@/lib/card-url";
import { parseYoutubeTimestamp, formatTimestamp } from "@/lib/youtube-time";
import { categorize } from "@/lib/category-sets";
import { stripLegacyReferencesTail } from "@/components/card/utils/card-render";
import type { CardData } from "@/lib/types/card";
import type { ProcedureReport } from "@/lib/procedure-report";
import styles from "./beta-skin.module.css";

/* ---------- 피드백 4) 비-피드 페이지 헤더 검색 → 피드로 라우팅 ----------
 * record/write/my/post 가 공유하는 검색 props 묶음.
 *   - 검색 제출(엔터/추천 클릭) → /beta-skin?q=키워드 (피드가 ?q= 를 읽어 자동 필터)
 *   - 카테고리 바로가기 → /beta-skin?cat=칩키
 * BetaSkinShell 의 onSearchSubmit / searchCategories / onPickCategory / 드롭다운 props 를 한 번에 반환. */
const NONFEED_CATEGORIES = [
  { key: "qa", label: "Q&A" },
  { key: "review", label: "시술후기" },
  { key: "doodle", label: "끄적끄적" },
  { key: "review_summary", label: "리포트" },
];
const NONFEED_SUGGEST = ["리프팅", "스킨부스터", "보톡스", "리쥬란", "써마지", "피코레이저"];
export function useBetaSearchRouting() {
  const router = useRouter();
  return {
    onSearchSubmit: (q: string) =>
      router.push(`/beta-skin?q=${encodeURIComponent(q)}`),
    searchCategories: NONFEED_CATEGORIES,
    onPickCategory: (key: string) => router.push(`/beta-skin?cat=${key}`),
    searchSuggestions: NONFEED_SUGGEST,
    recentSearches: ["리프팅", "스킨부스터"],
  };
}

/* ---------- 피드백 5) 키워드 → 카테고리별 연한 배경 칩 클래스 ----------
 * 운영 categorize(@/lib/category-sets)로 키워드를 5분류한 뒤
 * beta-skin.module.css 의 카테고리 톤 클래스(catLifting 등)로 매핑.
 * 인기 태그(피드 사이드)·관심 키워드(내 노트) 칩이 같은 톤을 공유. */
const CAT_TAG_CLASS: Record<string, string> = {
  concerns: styles.catConcerns,
  lifting: styles.catLifting,
  injectables: styles.catInjectables,
  homecare: styles.catHomecare,
  knowledge: styles.catKnowledge,
};
export function catTagClass(keyword: string): string {
  return CAT_TAG_CLASS[categorize(keyword)] ?? styles.catKnowledge;
}

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
/* ---------- 피드백 2) 댓글 블록 (운영 CommentsBlock 톤의 프리뷰판) ----------
 * 샘플 댓글 2~3 + 입력창. 입력은 타이핑 가능, 제출 시 로컬 추가(프리뷰 — 서버 미전송).
 * 피드 카드(펼침 후 댓글 아이콘 토글)·글 상세 둘 다 재사용. */
const SAMPLE_COMMENTS = [
  {
    name: "글로우업",
    text: "저도 멍 잘 드는 체질인데 재생테이프 붙이니 5일 만에 가라앉았어요!",
    when: "1주 전",
  },
  {
    name: "달빛피부",
    text: "다음 날 바로 출근했어요. 마스크 쓰니까 티 안 났어요 ㅎㅎ",
    when: "5일 전",
  },
];

export function BetaComments({ count }: { count?: number }) {
  const [items, setItems] = useState(SAMPLE_COMMENTS);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    // 프리뷰: 로컬에만 추가(서버 미전송).
    setItems((prev) => [{ name: "나", text: t, when: "방금" }, ...prev]);
    setDraft("");
  };

  return (
    <div className={styles.comments} onClick={(e) => e.stopPropagation()}>
      <h3 className={styles.commentHead}>댓글 {count ?? items.length}</h3>
      {items.map((c, i) => (
        <div className={styles.comment} key={`${c.name}-${i}`}>
          <span className={`${styles.avatar} ${styles.avatarGray}`} />
          <div>
            <div className={styles.commentName}>{c.name}</div>
            <p className={styles.commentText}>{c.text}</p>
            <div className={styles.commentWhen}>{c.when}</div>
          </div>
        </div>
      ))}
      <div className={styles.commentInput}>
        <input
          type="text"
          placeholder="따뜻한 댓글을 남겨 주세요"
          aria-label="댓글 입력"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" onClick={submit}>
          등록
        </button>
      </div>
    </div>
  );
}

export function PostCard({
  card,
  onTagClick,
}: {
  card: CardData;
  /** 항목 4) 카드 태그 클릭 → 그 키워드로 검색·필터 (헤더 검색창에 채움). */
  onTagClick?: (keyword: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // 피드백 2) 댓글 펼침 — 댓글 아이콘 클릭 시 샘플 댓글 + 입력창 노출.
  const [commentsOpen, setCommentsOpen] = useState(false);

  const authorName = card.doctor?.name ?? card.author?.display_name ?? "회원";
  const isDoctor = !!card.doctor && !card.hide_doctor_credential;
  const allTags = card.keywords ?? [];
  const tags = expanded ? allTags : allTags.slice(0, 7);
  // 피드백 1) 본문 끝 평문 "참고문헌\n1. ..." 꼬리 제거(운영 Critical-6 정합).
  //   → 본문 렌더(renderBetaBody)와 PubmedRefs 가 참고문헌을 이중 출력하지 않게.
  //   pubmed_refs 가 SSOT 이므로 본문 평문 꼬리는 잘라낸다.
  const body = stripLegacyReferencesTail(card.body ?? "");
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
    // 피드백 2) 등장 애니메이션 — 살짝 올라오며 페이드인(무한스크롤 추가 카드 포함).
    <article className={`${styles.card} ${styles.postCard} ${styles.fadeInUp}`}>
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
        {/* 피드백 2) 댓글 아이콘 클릭 → 댓글 섹션 토글. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn}`}
          aria-label="댓글"
          aria-expanded={commentsOpen}
          onClick={(e) => {
            e.stopPropagation();
            setCommentsOpen((v) => !v);
          }}
        >
          <IconComment /> {card.comment_count ?? 0}
        </button>
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

      {/* 피드백 2) 댓글 섹션 — 댓글 아이콘 클릭 시 펼침. */}
      {commentsOpen && <BetaComments count={card.comment_count ?? undefined} />}
    </article>
  );
}

/* ---------- 피드백 1·2) 시술 리포트 카드 (review_summary) ----------
 * 운영 ProcedureReportCard(variant="insert")의 지표 시각화·색·모양을 그대로 재현.
 *   - 재시술: 가로 분할 막대(있어요 #4CBFF2 / 고민중 #9AA1AC / 없어요 #EA7E7B) + 범례
 *   - 만족도: 별점(골드 #F59E0B) + 평균 + 5~1점 분포 막대(골드)
 *   - 통증: 5색 그라데이션 막대(#7FD0F8→#F08A8A) + 평균 위치 마커 + 없음/조금/보통/꽤/심함 라벨
 *   - 더보기: 그 자리서 인라인 펼침(운영 grid-rows 0fr↔1fr) → 자연어 요약, 다시 누르면 접힘.
 * 베타 캔버스 톤(둥근 흰 카드)은 유지하되 지표 모양·색은 운영을 따른다. */

// 운영 ProcedureReportCard 와 동일한 통증 팔레트·위치 매핑(없음 6.25% ~ 심함 93.75%).
const BETA_PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const BETA_PAIN_SOFT = ["#7FD0F8", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
function betaPainPos(value1to5: number): number {
  const v = Math.min(5, Math.max(1, value1to5));
  return 6.25 + ((v - 1) / 4) * 87.5;
}
// 운영 자연어 헤드라인(revisitPhrase/satisfactionPhrase/painPhrase) 재현.
function revisitPhrase(pct: number): string {
  if (pct >= 70) return `경험한 분들의 ${pct}%가 다시 받고 싶어 해요.`;
  if (pct >= 40) return `${pct}%가 다시 받을 의향이 있어요. 호불호가 갈리는 편이에요.`;
  return `다시 받겠다는 분은 ${pct}%예요. 신중히 고민해 보세요.`;
}
function satisfactionPhrase(avg: number): string {
  const x = avg.toFixed(1);
  if (avg >= 4.5) return `만족도 ${x}점! 다들 결과에 크게 만족했어요.`;
  if (avg >= 4.0) return `만족도 ${x}점, 대체로 만족하는 분위기예요.`;
  if (avg >= 3.0) return `만족도 ${x}점, 기대와 결과가 갈리는 편이에요.`;
  return `만족도 ${x}점으로 아쉬웠다는 의견이 많아요.`;
}
function painPhrase(avg: number): string {
  if (avg <= 0) return "통증 후기가 아직 적어요.";
  const x = avg.toFixed(1);
  let desc: string;
  if (avg < 1.5) desc = "거의 안 아파요.";
  else if (avg < 2.5) desc = "살짝 따끔한 정도예요.";
  else if (avg < 3.5) desc = "참을 만해요.";
  else if (avg < 4.5) desc = "참을 만하지만 꽤 뻐근해요.";
  else desc = "꽤 아픈 편이라 마취가 도움이 될 수 있어요.";
  return `통증 평균 ${x}점, ${desc}`;
}

export function BetaReportCard({ report }: { report: ProcedureReport }) {
  const {
    procedureKo,
    count,
    avgSatisfaction,
    satisfactionDist,
    avgPain,
    revisit,
  } = report;
  const [expanded, setExpanded] = useState(false);

  // 정식 URL = 한글 슬러그(/reports/{ko}) — 운영 ProcedureReportCard 와 동일.
  const reportHref = `/reports/${encodeURIComponent(procedureKo)}`;

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const yesDominant = revisit.yes >= revisit.no;

  // 통증 그라데이션(운영 painGradient 재현) — 라벨 위치에 색 정렬.
  const painPct = betaPainPos(avgPain > 0 ? avgPain : 1);
  const painGradient = `linear-gradient(90deg, ${BETA_PAIN_SOFT[0]} 0%, ${BETA_PAIN_SOFT.map(
    (c, i) => `${c} ${betaPainPos(i + 1)}%`,
  ).join(", ")}, ${BETA_PAIN_SOFT[BETA_PAIN_SOFT.length - 1]} 100%)`;

  const toggle = () => setExpanded((v) => !v);

  // 만족도 별점 노드(접힘 미리보기·펼침 상세 공용).
  const stars = (
    <span className={styles.reportStars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= satRounded ? "#F59E0B" : "#DDE2E7" }}>
          ★
        </span>
      ))}
    </span>
  );

  return (
    <article className={`${styles.card} ${styles.reportCard} ${styles.fadeInUp}`}>
      {/* 헤더 — 타이틀 클릭=/reports 이동(토글 영역 밖). */}
      <a
        className={styles.reportHead}
        href={reportHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.reportKicker}>피부텐텐 리포트</span>
        <div className={styles.reportTitleRow}>
          <h2 className={styles.reportTitle}>{procedureKo}</h2>
          <span className={styles.reportCount}>
            회원 경험 <b>{count}건</b>
          </span>
        </div>
      </a>

      {/* 지표 본문 — 클릭 시 인라인 펼침/접힘(운영 insert 모드). */}
      <div
        className={styles.reportBody}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {/* 재시술 의향 */}
        <div className={styles.reportSection}>
          <p className={styles.reportPhrase}>{revisitPhrase(yesPct)}</p>
          <div className={styles.reportBar}>
            {yesPct > 0 && (
              <span
                className={styles.reportBarYes}
                style={{ width: `${yesPct}%` }}
              >
                {yesPct >= (yesDominant ? 42 : 14)
                  ? yesDominant
                    ? "재시술 의향 있어요"
                    : "있어요"
                  : ""}
              </span>
            )}
            {maybePct > 0 && (
              <span
                className={styles.reportBarMaybe}
                style={{ width: `${maybePct}%` }}
              >
                {maybePct >= 12 ? "고민 중" : ""}
              </span>
            )}
            {noPct > 0 && (
              <span
                className={styles.reportBarNo}
                style={{ width: `${noPct}%` }}
              >
                {noPct >= (yesDominant ? 14 : 42)
                  ? yesDominant
                    ? "없어요"
                    : "재시술 의향 없어요"
                  : ""}
              </span>
            )}
          </div>
          <div className={styles.reportLegend}>
            <span>
              <i className={styles.reportDotYes} />
              있어요 {revisit.yes}명
            </span>
            {revisit.maybe > 0 && (
              <span>
                <i className={styles.reportDotMaybe} />
                고민 중 {revisit.maybe}명
              </span>
            )}
            <span>
              <i className={styles.reportDotNo} />
              없어요 {revisit.no}명
            </span>
          </div>
        </div>

        {/* 접힘 미리보기 — 만족도 별점 한 줄(펼치면 숨고 상세가 대신 드러남). */}
        {!expanded && (
          <div className={`${styles.reportSection} ${styles.reportPeek}`}>
            {stars}
            <span className={styles.reportPeekNum}>
              {avgSatisfaction.toFixed(1)}
            </span>
            <span className={styles.reportPeekHint}>
              만족도·통증 자세히는 더보기
            </span>
          </div>
        )}

        {/* 펼침 영역 — 더보기 시 그 자리서 만족도 분포 + 통증 상세가 드러남(조건부 렌더). */}
        {expanded && (
        <div className={`${styles.reportExpand} ${styles.fadeInUp}`}>
          <div className={styles.reportExpandInner}>
            {/* 만족도 — 별점 + 평균 + 5~1점 분포 막대 */}
            <div className={styles.reportSection}>
              <p className={styles.reportPhrase}>
                {satisfactionPhrase(avgSatisfaction)}
              </p>
              <div className={styles.reportSatRow}>
                <div className={styles.reportSatScore}>
                  {stars}
                  <span className={styles.reportSatNum}>
                    {avgSatisfaction.toFixed(1)}
                  </span>
                </div>
                <div className={styles.reportDist}>
                  {[5, 4, 3, 2, 1].map((score) => {
                    const c = satisfactionDist[score - 1] ?? 0;
                    return (
                      <div className={styles.reportDistRow} key={score}>
                        <span className={styles.reportDistKey}>{score}</span>
                        <span className={styles.reportDistTrack}>
                          <span
                            className={styles.reportDistFill}
                            style={{ width: `${(c / maxSat) * 100}%` }}
                          />
                        </span>
                        <span className={styles.reportDistCount}>{c}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 통증 — 5색 그라데이션 막대 + 평균 마커 + 5단계 라벨 */}
            <div className={styles.reportSection}>
              <p className={styles.reportPhrase}>{painPhrase(avgPain)}</p>
              <div
                className={styles.reportPainBar}
                style={{ background: painGradient }}
              >
                {avgPain > 0 && (
                  <span
                    className={styles.reportPainMarker}
                    style={{ left: `calc(${painPct}% - 1.5px)` }}
                  />
                )}
              </div>
              <div className={styles.reportPainLabels}>
                {BETA_PAIN_LABELS.map((l, i) => (
                  <span key={l} style={{ left: `${betaPainPos(i + 1)}%` }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* 안내 + 전체 리포트 링크 */}
            <div className={styles.reportSection}>
              <p className={styles.reportNote}>
                이 리포트는 회원 경험 {count}건을 집계한 결과입니다. 개인차가
                있으며 의학적 효과·안전성을 보장하지 않습니다. 시술 결정은 전문의
                상담 후 하시기 바랍니다.
              </p>
              <a
                className={styles.reportFullLink}
                href={reportHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                효과·다운타임·작성자 통계까지 전체 리포트 보기 →
              </a>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* 하단 더보기/접기 — 운영 insert 모드 컨트롤. */}
      <button
        type="button"
        className={styles.reportToggleBtn}
        aria-expanded={expanded}
        onClick={toggle}
      >
        {expanded ? "접기 ▴" : "더보기 ▾"}
      </button>
    </article>
  );
}

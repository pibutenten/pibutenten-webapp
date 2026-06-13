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

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CardAvatar from "@/components/card/CardAvatar";
import { pickHighlight } from "@/lib/card-highlight";
import { getQaUrl } from "@/lib/card-url";
import { parseYoutubeTimestamp, formatTimestamp } from "@/lib/youtube-time";
import { categorize } from "@/lib/category-sets";
import { stripLegacyReferencesTail } from "@/components/card/utils/card-render";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { getSessionId } from "@/lib/impression-queue";
import { showToast } from "@/lib/toast";
import CommentsBlock from "@/components/comments/CommentsBlock";
import type { CardData } from "@/lib/types/card";
import type { ProcedureReport } from "@/lib/procedure-report";
// 시술 리포트 — 운영 자연어 문구·통증 팔레트·위치 매핑 재사용(베타 자체 복제 제거).
import {
  revisitPhrase,
  satisfactionPhrase,
  painPhrase,
  downtimeHeadline,
  PAIN_LABELS,
  PAIN_SOFT,
  painPos,
} from "@/components/report/ProcedureReportCard";
// 더보기 펼침 영역 — 운영 보조 시각화 컴포넌트 그대로 임베드(데이터 정합·중복 재구현 방지).
import DowntimeGauge from "@/components/report/DowntimeGauge";
import EffectOnsetTimeline from "@/components/report/EffectOnsetTimeline";
import ReportReviewItem from "@/components/report/ReportReviewItem";
import { DOWNTIME_DAYS } from "@/lib/review-options";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { useSession } from "@/lib/session-context";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import styles from "./beta-skin.module.css";

/* ---------- 비-피드 페이지 헤더 검색 → 피드로 라우팅 ----------
 * record/write/my/post 가 공유하는 검색 props 묶음.
 *   - 검색 제출(엔터) → /beta-skin?q=키워드 (피드가 ?q= 를 읽어 자동 필터)
 * 드롭다운(최근검색·인기검색·카테고리 인기태그·자동완성)은 운영 BetaDiscovery 가 셸 안에서 담당하므로
 *   여기서는 onSearchSubmit 만 반환한다(자체 더미 카테고리/추천 셋 제거). */
export function useBetaSearchRouting() {
  const router = useRouter();
  return {
    onSearchSubmit: (q: string) => {
      // 빈/공백 검색어는 서버 재검색·search_logs 오염 방지를 위해 차단.
      const t = q.trim();
      if (t) router.push(`/beta-skin?q=${encodeURIComponent(t)}`);
    },
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
/* ---------- 카드 액션 훅 (좋아요·저장·공유 실제 동작) ----------
 * 운영 useCardEngagement 의 좋아요/저장/공유 RPC 흐름을 베타 카드용으로 옮긴 경량 훅.
 *   - me 3-state: undefined(로딩중·클릭 무시) / null(비로그인·토스트 안내) / {id}(로그인·정상).
 *   - 좋아요/저장: 낙관적 업데이트 후 toggle_card_like / toggle_card_save RPC 권위값으로 동기화.
 *       실패 시 롤백 + 토스트. p_identity_id 는 active 명함(getActiveIdentityId).
 *   - 공유: shareBetaCard(navigator.share / clipboard) 후 card_shares INSERT(channel='link-copy').
 *       비로그인이면 profile_id=null, session_id 로 dedup(운영 0117 정책 정합). */
export type BetaViewerState = { liked?: boolean; saved?: boolean };
export function useBetaCardActions(card: CardData, viewer?: BetaViewerState) {
  const [me, setMe] = useState<{ id: string } | null | undefined>(undefined);
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(card.like_count ?? 0);
  const [likePending, setLikePending] = useState(false);
  const [saved, setSaved] = useState(viewer?.saved ?? false);
  const [saveCount, setSaveCount] = useState(card.save_count ?? 0);
  const [savePending, setSavePending] = useState(false);
  const [shareCount, setShareCount] = useState(card.share_count ?? 0);
  useEffect(() => {
    let alive = true;
    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setMe(data.user ? { id: data.user.id } : null);
      });
    return () => {
      alive = false;
    };
  }, []);
  const toggleLike = useCallback(() => {
    if (me === undefined) return;
    if (me === null) {
      showToast("좋아요는 로그인 후 이용할 수 있어요", { tone: "default" });
      return;
    }
    if (likePending) return;
    setLikePending(true);
    const was = liked;
    setLiked(!was);
    setLikeCount((c) => (was ? Math.max(0, c - 1) : c + 1));
    (async () => {
      try {
        const { data, error } = await createSupabaseBrowserClient().rpc(
          "toggle_card_like",
          { p_card_id: card.id, p_identity_id: getActiveIdentityId() },
        );
        if (error) throw error;
        const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
        if (row) {
          setLiked(row.liked);
          setLikeCount(row.like_count);
        }
      } catch {
        setLiked(was);
        setLikeCount((c) => (was ? c + 1 : Math.max(0, c - 1)));
        showToast("잠시 후 다시 시도해 주세요", { tone: "danger" });
      } finally {
        setLikePending(false);
      }
    })();
  }, [card.id, liked, likePending, me]);
  const toggleSave = useCallback(() => {
    if (me === undefined) return;
    if (me === null) {
      showToast("저장은 로그인 후 이용할 수 있어요", { tone: "default" });
      return;
    }
    if (savePending) return;
    setSavePending(true);
    const was = saved;
    setSaved(!was);
    setSaveCount((c) => (was ? Math.max(0, c - 1) : c + 1));
    (async () => {
      try {
        const { data, error } = await createSupabaseBrowserClient().rpc(
          "toggle_card_save",
          { p_card_id: card.id, p_identity_id: getActiveIdentityId() },
        );
        if (error) throw error;
        const row = (data as { saved: boolean; save_count: number }[] | null)?.[0];
        if (row) {
          setSaved(row.saved);
          setSaveCount(row.save_count);
        }
      } catch {
        setSaved(was);
        setSaveCount((c) => (was ? c + 1 : Math.max(0, c - 1)));
        showToast("잠시 후 다시 시도해 주세요", { tone: "danger" });
      } finally {
        setSavePending(false);
      }
    })();
  }, [card.id, saved, savePending, me]);
  const doShare = useCallback(async () => {
    const href = cardHref(card);
    await shareBetaCard(href, card.title ?? undefined);
    try {
      const sb = createSupabaseBrowserClient();
      const { data: u } = await sb.auth.getUser();
      const profileId = u.user ? (getActiveIdentityId() ?? u.user.id) : null;
      setShareCount((c) => c + 1);
      await sb.from("card_shares").insert({
        card_id: card.id,
        profile_id: profileId,
        session_id: getSessionId(),
        channel: "link-copy",
      });
    } catch {
      /* 공유 카운트 실패 무시 */
    }
  }, [card]);
  return {
    me,
    like: { active: liked, count: likeCount, pending: likePending, toggle: toggleLike },
    save: { active: saved, count: saveCount, pending: savePending, toggle: toggleSave },
    share: { count: shareCount, share: doShare },
  };
}

export function PostCard({
  card,
  onTagClick,
  viewer,
}: {
  card: CardData;
  /** 항목 4) 카드 태그 클릭 → 그 키워드로 검색·필터 (헤더 검색창에 채움). */
  onTagClick?: (keyword: string) => void;
  /** 서버 prefetch 한 좋아요/저장 상태 — 첫 렌더부터 정확한 active 표시. */
  viewer?: BetaViewerState;
}) {
  const [expanded, setExpanded] = useState(false);
  // 피드백 2) 댓글 펼침 — 댓글 아이콘 클릭 시 실제 댓글(CommentsBlock) 노출.
  const [commentsOpen, setCommentsOpen] = useState(false);
  // cards 테이블에 comment_count 컬럼이 없어 정적값은 항상 0 → 운영 Card.tsx 패턴 이식.
  //   CommentsBlock 의 onCountChange 로 실제 댓글 수를 받아 갱신.
  const [commentCount, setCommentCount] = useState(card.comment_count ?? 0);
  // 좋아요·저장·공유 실제 동작.
  const act = useBetaCardActions(card, viewer);

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

      {/* 항목10) 제목 — 클릭 시 단독 URL(getQaUrl)로 이동(운영 CardBody 정합).
          내부 링크 신호 누적 + 크롤러 색인. 본문 펼침 토글과 분리(제목은 토글 div 밖). */}
      {hasHref ? (
        <a
          className={styles.postTitleLink}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className={styles.postTitle}>{card.title}</h2>
        </a>
      ) : (
        <h2 className={styles.postTitle}>{card.title}</h2>
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
        {body && (
          <div className={styles.postBodyRich}>
            {renderBetaBody(body, hlColor, isLong && !expanded)}
          </div>
        )}
        {/* 항목9) 더보기만 노출 — 펼친 글은 본문 클릭으로 접히므로 '접기' 라벨 불필요. */}
        {isLong && !expanded && (
          <span className={styles.moreToggle}>더보기</span>
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
        {/* 좋아요 — 실제 toggle_card_like RPC. active 시 pfOn. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn} ${act.like.active ? styles.pfOn : ""}`}
          aria-pressed={act.like.active}
          aria-label="좋아요"
          onClick={(e) => {
            e.stopPropagation();
            act.like.toggle();
          }}
        >
          <IconHeart /> {act.like.count}
        </button>
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
          <IconComment /> {commentCount}
        </button>
        {/* 저장 — 실제 toggle_card_save RPC. active 시 pfSaved. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn} ${act.save.active ? styles.pfSaved : ""}`}
          aria-pressed={act.save.active}
          aria-label="저장"
          onClick={(e) => {
            e.stopPropagation();
            act.save.toggle();
          }}
        >
          <IconBookmark /> {act.save.count}
        </button>
        {/* 항목 5) 공유 — 실제 URL 을 navigator.share / clipboard 로 + card_shares INSERT. */}
        <button
          type="button"
          className={styles.pfBtn}
          aria-label="공유"
          onClick={(e) => {
            e.stopPropagation();
            void act.share.share();
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

      {/* 피드백 2) 댓글 섹션 — 댓글 아이콘 클릭 시 실제 댓글(운영 CommentsBlock) 펼침. */}
      {commentsOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <CommentsBlock
            cardId={card.id}
            doctorSlug={card.doctor?.slug ?? null}
            cardDoctorId={card.doctor?.id ?? null}
            isPublishedQa
            showInput
            disableAutoFocus
            onCountChange={setCommentCount}
          />
        </div>
      )}
    </article>
  );
}

/* ---------- 시술 리포트 카드 (review_summary) ----------
 * UI(둥근 흰 카드·재시술 막대·만족도 분포·통증 막대)는 베타 스킨 유지, 데이터·로직은 운영 재사용.
 *   - 자연어 문구(revisitPhrase/satisfactionPhrase/painPhrase/downtimeHeadline)·통증 팔레트
 *     (PAIN_LABELS/PAIN_SOFT/painPos)는 운영 ProcedureReportCard 에서 import(중복 복제 제거).
 *   - 더보기(펼침): 운영 insert 카드와 동일하게 1회 lazy fetch
 *     (/api/reports/{en}/reviews?include_report=1&limit=3) 로 풀집계+후기 3개를 받아
 *     다운타임·효과·효과시점·작성자 통계·개별 후기를 **인라인 렌더**(운영 보조 컴포넌트 임베드).
 *   - "전체 리포트 보기 →" 링크는 펼친 맨 아래에만(접힘 상태 비노출).
 *
 * getReviewSummaryFeedPool 가 내려주는 피드 풀은 effects/demographics/downtime/onset 이 비어 있어
 * (컴팩트), 펼칠 때 lazy fetch 한 풀집계로 교체해 운영과 동일한 알맹이를 채운다. */

// lazy fetch 응답(운영 /api/reports/[procedure]/reviews 와 동일 형태).
type BetaReviewsApiResponse = {
  reviews: CardData[];
  reviewLiked: Record<number, boolean>;
  report?: ProcedureReport | null;
};
const BETA_INSERT_REVIEW_CAP = 3;

// 효과 영역 막대 색 — 운영 ProcedureReportCard EFFECT_BAR_COLORS 와 동일 톤.
const BETA_EFFECT_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];
const BETA_AGE_COLORS = ["#A8C2E6", "#9AA6DE", "#C3B0E8", "#F2A9C0", "#FFCB8C"];

export function BetaReportCard({ report }: { report: ProcedureReport }) {
  const [expanded, setExpanded] = useState(false);
  // 펼침 시 1회 lazy fetch 한 풀집계+후기(있으면 prop 대신 사용) — 운영 loadFeedDetail 이식.
  const [fetched, setFetched] = useState<BetaReviewsApiResponse | null>(null);
  const [loadingExpand, setLoadingExpand] = useState(false);
  // 개별 후기 좋아요용 — me(active 명함) 단일 출처(SSR session). 비로그인 → null.
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  // 표시에 쓰는 집계 — lazy fetch 성공 시 풀집계로 교체(컴팩트 풀의 빈 effects/demographics 보강).
  const rep = fetched?.report ?? report;
  const {
    procedureKo,
    en,
    count,
    avgSatisfaction,
    satisfactionDist,
    avgPain,
    revisit,
    effects,
    noEffectCount,
    downtimeAnswered,
    downtimeDist,
    onsetAnswered,
    demographics,
  } = rep;

  // 정식 URL = 한글 슬러그(/reports/{ko}) — 운영 ProcedureReportCard 와 동일.
  const reportHref = `/reports/${encodeURIComponent(procedureKo)}`;

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const yesDominant = revisit.yes >= revisit.no;

  // 통증 그라데이션·마커 — 운영 painPos/PAIN_SOFT/PAIN_LABELS 그대로.
  const painPct = painPos(avgPain > 0 ? avgPain : 1);
  const painGradient = `linear-gradient(90deg, ${PAIN_SOFT[0]} 0%, ${PAIN_SOFT.map(
    (c, i) => `${c} ${painPos(i + 1)}%`,
  ).join(", ")}, ${PAIN_SOFT[PAIN_SOFT.length - 1]} 100%)`;

  // 다운타임 평균(일) → 자연어 헤드라인(운영과 동일 계산).
  const dtAvg =
    downtimeAnswered > 0
      ? downtimeDist.reduce((s, c, i) => s + c * (DOWNTIME_DAYS[i] ?? 0), 0) /
        downtimeAnswered
      : 0;
  const topEffects = effects.slice(0, 6);
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const ageTotal = Math.max(
    1,
    demographics.ageBands.reduce((a, b) => a + b.count, 0),
  );

  // 펼침 후기 — lazy fetch 결과 최대 3개.
  const insertReviews = (fetched?.reviews ?? []).slice(0, BETA_INSERT_REVIEW_CAP);
  const insertLiked = fetched?.reviewLiked ?? {};

  // 처음 펼칠 때만 1회 lazy fetch(운영 loadFeedDetail) — en 슬러그로 풀집계+후기 3.
  const loadFeedDetail = useCallback(async () => {
    if (loadingExpand || fetched || !en) return;
    setLoadingExpand(true);
    try {
      const qs = new URLSearchParams({
        offset: "0",
        limit: String(BETA_INSERT_REVIEW_CAP),
        include_report: "1",
      });
      const res = await fetch(`/api/reports/${encodeURIComponent(en)}/reviews?${qs}`);
      if (res.ok) setFetched((await res.json()) as BetaReviewsApiResponse);
    } catch {
      /* 실패 시 컴팩트 집계만 유지 */
    } finally {
      setLoadingExpand(false);
    }
  }, [loadingExpand, fetched, en]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadFeedDetail();
  };

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
          </div>
        )}

        {/* 펼침 영역 — 더보기 시 그 자리서 만족도·통증 + (lazy) 다운타임·효과·효과시점·작성자통계가 드러남. */}
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
                {PAIN_LABELS.map((l, i) => (
                  <span key={l} style={{ left: `${painPos(i + 1)}%` }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* lazy fetch 로딩 표시 — 풀집계 도착 전 잠깐. */}
            {loadingExpand && !fetched && (
              <p className={styles.reportNote}>불러오는 중…</p>
            )}

            {/* 다운타임 — 운영 DowntimeGauge 임베드. answered===0 이면 컴포넌트가 null. */}
            {downtimeAnswered > 0 && (
              <div className={styles.reportSection}>
                <p className={styles.reportPhrase}>{downtimeHeadline(dtAvg)}</p>
                <DowntimeGauge
                  dist={downtimeDist}
                  answered={downtimeAnswered}
                  days={DOWNTIME_DAYS}
                />
              </div>
            )}

            {/* 효과 영역 — 빈도 상위 6개 막대(운영 effects 시각화 재현). */}
            {topEffects.length > 0 && (
              <div className={styles.reportSection}>
                <p className={styles.reportPhrase}>
                  {procedureKo} 받은 분들이 느낀 효과예요.
                </p>
                <div className={styles.reportEffectList}>
                  {topEffects.map((e, i) => (
                    <div key={e.label} className={styles.reportEffectRow}>
                      <span className={styles.reportEffectLabel}>{e.label}</span>
                      <span className={styles.reportEffectTrack}>
                        <span
                          className={styles.reportEffectFill}
                          style={{
                            width: `${e.pct}%`,
                            backgroundColor:
                              BETA_EFFECT_COLORS[i % BETA_EFFECT_COLORS.length],
                          }}
                        />
                      </span>
                      <span className={styles.reportEffectPct}>{e.pct}%</span>
                    </div>
                  ))}
                </div>
                {noEffectCount > 0 && (
                  <p className={styles.reportEffectNone}>
                    효과를 느끼지 못했다고 답한 분도 {noEffectCount}명 있었어요.
                  </p>
                )}
              </div>
            )}

            {/* 효과 시점 — 운영 EffectOnsetTimeline 임베드. answered===0 숨김. */}
            {onsetAnswered > 0 && (
              <div className={styles.reportSection}>
                <p className={styles.reportPhrase}>효과를 느끼기 시작한 시점이에요.</p>
                <EffectOnsetTimeline dist={rep.onsetDist} />
              </div>
            )}

            {/* 작성자 통계 — 성별·연령 분할 바(운영 demographics 재현). */}
            {demographics.total > 0 && (
              <div className={styles.reportSection}>
                <p className={styles.reportPhrase}>작성자 통계</p>
                <div className={styles.reportDemoBar}>
                  {femalePct > 0 && (
                    <span style={{ width: `${femalePct}%`, backgroundColor: "#F59CB6" }} />
                  )}
                  {malePct > 0 && (
                    <span style={{ width: `${malePct}%`, backgroundColor: "#7FD0F8" }} />
                  )}
                </div>
                <div className={styles.reportDemoLegend}>
                  <span>
                    <i style={{ backgroundColor: "#F59CB6" }} />
                    여성 {femalePct}%
                  </span>
                  <span>
                    <i style={{ backgroundColor: "#7FD0F8" }} />
                    남성 {malePct}%
                  </span>
                </div>
                {demographics.ageBands.length > 0 && (
                  <>
                    <div className={`${styles.reportDemoBar} ${styles.reportDemoBarAge}`}>
                      {demographics.ageBands.map((b, i) => {
                        const pct = Math.round((b.count / ageTotal) * 100);
                        return pct > 0 ? (
                          <span
                            key={b.label}
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                BETA_AGE_COLORS[i % BETA_AGE_COLORS.length],
                            }}
                          />
                        ) : null;
                      })}
                    </div>
                    <div className={styles.reportDemoLegend}>
                      {demographics.ageBands.map((b, i) => {
                        const pct = Math.round((b.count / ageTotal) * 100);
                        return (
                          <span key={b.label}>
                            <i
                              style={{
                                backgroundColor:
                                  BETA_AGE_COLORS[i % BETA_AGE_COLORS.length],
                              }}
                            />
                            {b.label} {pct}%
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 개별 후기 — 운영 ReportReviewItem 임베드(최대 3). 좋아요는 단독 글과 동일 RPC. */}
            {insertReviews.length > 0 && (
              <div
                className={styles.reportSection}
                onClick={(e) => e.stopPropagation()}
              >
                <p className={styles.reportPhrase}>후기 {count}개</p>
                <ul className={styles.reportReviewList}>
                  {insertReviews.map((card) => (
                    <ReportReviewItem
                      key={card.id}
                      card={card}
                      liked={insertLiked[card.id] ?? false}
                      me={me}
                      onLoginRequired={(reason) => setAuthPrompt(reason)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* 안내 + 전체 리포트 링크 — 펼친 맨 아래에만. */}
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
                전체 리포트 보기 →
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

      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </article>
  );
}

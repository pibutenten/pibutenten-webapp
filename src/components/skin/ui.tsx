"use client";

/**
 * ui — 신규 스킨 공용 카드 UI · 헬퍼 · 인라인 아이콘. (구 app skin 프리뷰에서 운영 승격.)
 *
 * 피드(FeedView)·글 상세(PostDetail)·내 노트(record) 등 여러 페이지가
 * 같은 카드 컴포넌트/아이콘/링크 헬퍼를 재사용하도록 한 곳에 모음 (DRY).
 *
 * 운영 동작 이식 (읽기만, 직접 재사용/재현):
 *   - 아바타: 운영 CardAvatar 를 그대로 import (getDoctorPhoto/Theme 보정 → 얼굴 안 잘림).
 *   - 본문 볼드·형광펜: pickHighlight(card id) 로 카드별 색 결정 + **bold** → strong + 형광펜
 *     (운영 renderAnswerBody 의 linear-gradient(transparent 60%, color 60%) 방식 재현).
 *   - 영상 pill 타임스탬프: external_url(youtube t/start) → 없으면 video.youtube_url 에서 mm:ss.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import CardAvatar from "@/components/card/CardAvatar";
import { pickHighlight } from "@/lib/card-highlight";
import { highlight } from "@/components/card/utils/card-render";
import { getQaUrl, getQaEditUrl } from "@/lib/card-url";
import { parseYoutubeTimestamp, formatTimestamp } from "@/lib/youtube-time";
import { categorize } from "@/lib/category-sets";
import { shortLabelForCategory } from "@/lib/post-category";
import { stripLegacyReferencesTail } from "@/components/card/utils/card-render";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { shareCard } from "@/components/card/utils/card-share";
import { ROLES } from "@/lib/identity-shared";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";
import { getSessionId } from "@/lib/impression-queue";
import { showToast } from "@/lib/toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import CommentsBlock from "@/components/comments/CommentsBlock";
import type { CommentPreview } from "@/lib/types/comment";
import RecentLikers from "@/components/RecentLikers";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";
import { useCardViewer } from "@/components/card/hooks/useCardViewer";
import type { CardData } from "@/lib/types/card";
// (리포트 카드는 운영 ProcedureReportCard 를 FeedView 에서 직접 재사용 — 앱 스킨 자체 ReportCard 폐기.)
import { useSession } from "@/lib/session-context";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import styles from "./app.module.css";

/* ---------- 비-피드 페이지 헤더 검색 → 피드로 라우팅 ----------
 * record/write/my/post 가 공유하는 검색 props 묶음.
 *   - 검색 제출(엔터) → /?q=키워드 (운영 홈피드가 ?q= 를 읽어 서버 재검색)
 * 드롭다운(최근검색·인기검색·카테고리 인기태그·자동완성)은 운영 SearchPanel 가 셸 안에서 담당하므로
 *   여기서는 onSearchSubmit 만 반환한다(자체 더미 카테고리/추천 셋 제거).
 *
 * 홈 승격(2026-06-14) 이후 검색은 운영 홈(/?q=)으로 통일한다. 모든 스킨 화면(record/write/my 등)이
 *   이 운영 검색으로 빠져나가는 게 정합(구 app skin 프리뷰 경로는 폐기). */
export function useSearchRouting() {
  const router = useRouter();
  return {
    onSearchSubmit: (q: string) => {
      // 빈/공백 검색어는 서버 재검색·search_logs 오염 방지를 위해 차단.
      const t = q.trim();
      if (t) router.push(`/?q=${encodeURIComponent(t)}`);
    },
  };
}

/* ---------- 피드백 5) 키워드 → 카테고리별 연한 배경 칩 클래스 ----------
 * 운영 categorize(@/lib/category-sets)로 키워드를 9분류한 뒤
 * app.module.css 의 카테고리 톤 클래스(catLifting 등)로 매핑.
 * 인기 태그(피드 사이드)·관심 키워드(내 노트) 칩이 같은 톤을 공유. */
const CAT_TAG_CLASS: Record<string, string> = {
  concerns: styles.catConcerns,
  lifting: styles.catLifting,
  skinbooster: styles.catSkinbooster,
  filler: styles.catFiller,
  contour: styles.catContour,
  laser: styles.catLaser,
  other: styles.catOther,
  homecare: styles.catHomecare,
  knowledge: styles.catKnowledge,
};
export function catTagClass(keyword: string): string {
  return CAT_TAG_CLASS[categorize(keyword)] ?? styles.catKnowledge;
}
/* 신규1) 태그 호버색 = 카테고리 활성색 일치용 — 키워드의 카테고리 키(concerns/lifting/…)를
 * data-cat 속성으로 내보내, 평소엔 회색(.t)·호버 시에만 그 카테고리 틴트가 되도록 CSS 가 매칭.
 * (선택 시 catTagClass 와 같은 톤 → 호버색과 선택색이 일치.) */
export function catKey(keyword: string): string {
  return categorize(keyword);
}

/* ---------- 카드 → 실제 운영(canonical) URL ----------
 *   - 카드별 실제 canonical URL 을 생성(운영 getQaUrl 재사용):
 *       의사 글: /doctors/{slug}/{year}/{post-slug}
 *       회원 글: /{handle}/{shortcode}
 *       시술 리포트(review_summary): /reports/{en} (getQaUrl 이 처리)
 *   - 제목 링크가 이 URL 로 같은 탭 이동. 본문 펼침/접힘은 인라인(아래 PostCard).
 *   - URL 정보가 부족하면 "/"(홈) 반환 → 호출부에서 링크 자체를 숨긴다.
 * NB: record-data.ts 의 cardHrefFromRecord 와는 별개다(저쪽은 record 도메인의 좁은 row 전용,
 *     review_summary 미포함). 입력 타입이 달라 통합하지 않고 이름으로 구분한다. */
export function cardHref(c: CardData): string {
  return getQaUrl(c);
}

/* ---------- 카드 → 작성자 프로필 URL (운영 CardHeader 동선 재현) ----------
 * 작성자(아바타+이름) 클릭 → 프로필로 이동.
 *   - 의사(credential 노출): /doctors/{slug} (운영 — 앱 스킨엔 원장 프로필이 없고 글상세 우측 프로필이 대체)
 *   - 회원(handle 있음):     /{handle} (운영 공개 프로필 — noindex 프리뷰 URL 누수 방지)
 *   - 회원(handle 없음):     /u/{id} (운영 CardHeader.tsx:129 레거시 폴백과 동일)
 *   - 탈퇴 sentinel:         null → 링크 비활성 (운영 CardHeader.tsx:64-68 동일 정책).
 *       handle === 'deleted-user' 또는 id === well-known UUID 면 프로필 페이지가 없어 404 → 링크 자체를 막는다.
 *   - 정보 부족: null → 호출부에서 링크 대신 일반 텍스트로 렌더. */
export function authorHref(c: CardData): string | null {
  const isDoctor = !!c.doctor && !c.hide_doctor_credential;
  if (isDoctor && c.doctor?.slug) return `/doctors/${c.doctor.slug}`;
  // 탈퇴 회원 sentinel — 운영과 동일하게 프로필 링크를 만들지 않는다.
  const isDeletedUser =
    c.author?.handle === "deleted-user" ||
    c.author?.id === "00000000-0000-0000-0000-000000000000";
  if (isDeletedUser) return null;
  // handle 우선, 없으면 /u/{id} 레거시 폴백 — 운영 CardHeader 라우팅과 동일 정책.
  if (c.author?.handle) return `/${c.author.handle}`;
  if (c.author?.id) return `/u/${c.author.id}`;
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

/* ---------- 공유: 운영 shareCard(@/components/card/utils/card-share) 재사용 ----------
 * 자체 구현(shareCard) 폐기 — 모바일 네이티브 시트 / 데스크탑 클립보드+토스트,
 * 사용자 취소(AbortError) 구분, card_shares.channel 채널 반환까지 운영과 100% 동일. */

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
      // 좁은 칩 라벨은 SSOT(post-category shortLabel) 참조 — 화면별 하드코딩 금지.
      return shortLabelForCategory("review_summary");
    case "post":
      // 구 type="post"(일반 글) 은 v7 끄적끄적으로 통합 — doodle 과 동일 라벨.
      return "끄적끄적";
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
export function renderBody(
  text: string,
  highlightColor: string,
  clamped: boolean,
  query?: string,
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
                {/* 항목1) 검색어 노란 하이라이트(운영 highlight 재사용) — 본문 평문 부분에만. */}
                {highlight(para.slice(lastIdx, m.index), query)}
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
            <Fragment key={`t${pi}-${key++}`}>
              {highlight(para.slice(lastIdx), query)}
            </Fragment>,
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
 * 운영 useCardEngagement 의 좋아요/저장/공유 RPC 흐름을 앱 카드용으로 옮긴 경량 훅.
 *   - me 3-state: undefined(로딩중·클릭 무시) / null(비로그인·토스트 안내) / {id}(로그인·정상).
 *   - 좋아요/저장: 낙관적 업데이트 후 toggle_card_like / toggle_card_save RPC 권위값으로 동기화.
 *       실패 시 롤백 + 토스트. p_identity_id 는 active 명함(getActiveIdentityId).
 *   - 공유: shareCard(navigator.share / clipboard) 후 card_shares INSERT(channel='link-copy').
 *       비로그인이면 profile_id=null, session_id 로 dedup(운영 0117 정책 정합). */
export type ViewerState = { liked?: boolean; saved?: boolean };
export function useCardActions(card: CardData, viewer?: ViewerState) {
  // me 는 SSR SessionContext 단일 출처(운영 useCardViewer 정합, ADR 0012). myId=로그인 게이트(null=로그아웃).
  //   옛 per-card auth.getUser() useEffect 제거(PERF, 2026-06-26) — 카드 N장당 /auth/v1/user 호출 폭주 +
  //   첫 paint 후 me 깜빡임 차단. 실제 식별자는 getActiveIdentityId()(쿠키 동기)가 RPC 에 전달.
  const session = useSession();
  const myId = session?.activeIdentityId ?? null;
  const me: { id: string } | null = myId ? { id: myId } : null;
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [likeCount, setLikeCount] = useState(card.like_count ?? 0);
  const [likePending, setLikePending] = useState(false);
  const [likePulsing, setLikePulsing] = useState(false);
  const [saved, setSaved] = useState(viewer?.saved ?? false);
  const [saveCount, setSaveCount] = useState(card.save_count ?? 0);
  const [savePending, setSavePending] = useState(false);
  const [shareCount, setShareCount] = useState(card.share_count ?? 0);
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null);
  // 사용자가 직접 좋아요/저장을 토글했는지 — true 면 아래 viewer 동기화 effect 가 낙관값을 덮지 않음.
  const interactedRef = useRef(false);
  // viewer 상태(서버 seed 또는 클라 배치)가 도착/변경되면 동기화.
  //   useState 초기화는 마운트 1회뿐이라, 배치가 async 로 와도 이 effect 로 반영.
  //   사용자가 이미 토글했으면(interactedRef) 그 낙관값을 덮지 않음.
  useEffect(() => {
    if (interactedRef.current) return;
    setLiked(viewer?.liked ?? false);
    setSaved(viewer?.saved ?? false);
  }, [viewer?.liked, viewer?.saved]);
  const toggleLike = useCallback(() => {
    if (!myId) {
      setLoginPrompt("좋아요를 누르려면 로그인이 필요해요");
      return;
    }
    interactedRef.current = true;
    if (likePending) return;
    setLikePending(true);
    const was = liked;
    setLiked(!was);
    setLikeCount((c) => (was ? Math.max(0, c - 1) : c + 1));
    if (!was) {
      setLikePulsing(true);
      if (typeof navigator !== "undefined") navigator.vibrate?.(10);
    }
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
  }, [card.id, liked, likePending, myId]);
  const toggleSave = useCallback(() => {
    if (!myId) {
      setLoginPrompt("저장하려면 로그인이 필요해요");
      return;
    }
    interactedRef.current = true;
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
  }, [card.id, saved, savePending, myId]);
  const doShare = useCallback(async () => {
    // 운영 shareCard 재사용 — 모바일: 네이티브 공유 시트 / 데스크탑: 클립보드 복사 + "링크가 복사되었어요" 토스트.
    //   반환 채널(native/link-copy)을 그대로 기록. 사용자 취소·실패(null)면 카운트/기록 안 함.
    const channel = await shareCard(card);
    if (!channel) return;
    try {
      const sb = createSupabaseBrowserClient();
      const { data: u } = await sb.auth.getUser();
      const profileId = u.user ? (getActiveIdentityId() ?? u.user.id) : null;
      setShareCount((c) => c + 1);
      const { error } = await sb.from("card_shares").insert({
        card_id: card.id,
        profile_id: profileId,
        session_id: getSessionId(),
        channel,
      });
      if (error) throw error;
    } catch (e) {
      // 실패 시 낙관 카운트 복원 + 안내 — toggleLike/toggleSave 와 동일 패턴.
      console.error("[useCardActions] doShare:", e);
      setShareCount((c) => Math.max(0, c - 1));
      showToast("잠시 후 다시 시도해 주세요", { tone: "danger" });
    }
  }, [card]);
  return {
    me,
    like: { active: liked, count: likeCount, pending: likePending, pulsing: likePulsing, clearPulse: () => setLikePulsing(false), toggle: toggleLike },
    save: { active: saved, count: saveCount, pending: savePending, toggle: toggleSave },
    share: { count: shareCount, share: doShare },
    loginPrompt, dismissLoginPrompt: () => setLoginPrompt(null),
  };
}

/* 신고 사유(REPORT_REASONS·ReportReason)는 SSOT(@/lib/report-reasons)에서 import — 파일 상단 참조.
   폼·앱모달·관리자·API 4곳이 같은 출처를 써 라벨 표기 불일치를 제거(2026-06-26). */

/* ---------- 신고 모달 (SNS 표준 — 사유 선택 후 /api/reports POST) ----------
 * 타인 글 ⋮ → "신고하기" 클릭 시 노출되는 바텀시트형 모달.
 *   - 사유 라디오 리스트(필수) + 상세 detail(선택, 최대 2000자).
 *   - 전송: 운영 신고 API(/api/reports)에 { reason, card_id, detail? } POST.
 *       성공 → "신고가 접수되었어요" 토스트 + 모달 닫힘.
 *       실패 → API 메시지(또는 폴백) 토스트(danger). rate-limit(분당 3건) 초과도 여기로.
 *   - 운영 API 는 로그인/비로그인 모두 허용하나, 호출부(PostCardMenu)에서 비로그인은
 *     모달을 열기 전에 로그인 유도로 분기하므로 이 모달은 로그인 회원 전용 경로로만 진입.
 *   - 앱 톤(app.module.css 토큰)만 사용 — 운영 ReportForm(Tailwind)과 격리. */
function ReportModal({
  card,
  onClose,
}: {
  card: CardData;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ESC 로 닫기(A11y) — 제출 중에는 유지.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  async function submit() {
    if (!reason) {
      showToast("신고 사유를 선택해 주세요", { tone: "danger" });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          card_id: card.id,
          detail: detail.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        showToast(json.message || json.error || "신고 접수에 실패했어요", {
          tone: "danger",
        });
        setSubmitting(false);
        return;
      }
      showToast("신고가 접수되었어요");
      onClose();
    } catch {
      showToast("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요", {
        tone: "danger",
      });
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.reportOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="게시물 신고"
      onClick={(e) => {
        // 오버레이(바깥) 클릭 시 닫기 — 시트 내부 클릭은 전파 차단.
        e.stopPropagation();
        if (!submitting) onClose();
      }}
    >
      <div
        className={styles.reportSheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.reportHead}>신고하기</div>
        <p className={styles.reportLead}>
          신고 사유를 선택해 주세요. 접수된 신고는 운영팀이 검토합니다.
        </p>

        <div className={styles.reportReasons} role="radiogroup" aria-label="신고 사유">
          {REPORT_REASONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              role="radio"
              aria-checked={reason === opt.value}
              className={`${styles.reportReason} ${
                reason === opt.value ? styles.reportReasonOn : ""
              }`}
              onClick={() => setReason(opt.value)}
            >
              <span className={styles.reportRadio} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>

        <textarea
          className={styles.reportDetail}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="상세 내용 (선택)"
        />

        <div className={styles.reportActions}>
          <button
            type="button"
            className={styles.reportCancel}
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className={styles.reportSubmit}
            onClick={submit}
            disabled={submitting || !reason}
          >
            {submitting ? "접수 중…" : "신고"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 카드 ⋮ 더보기 메뉴 (본인 글 수정/삭제 · 관리자 숨김 · 타인 글 신고) ----------
 * 운영 CardHeader/Card 의 관리 수단을 PostCard 로 이식(읽기→재현, 직접 수정 X).
 * + SNS 표준(인스타·X) 정합: ⋮ 를 모든 로그인 회원에게 노출하고 권한별 항목 분기.
 *
 * 권한 판정(운영 Card.tsx 정합):
 *   - me = useSession() (SSR SessionContext 단일 출처) → { activeIdentityId, role }.
 *     로그아웃 = null. role 은 마운트 직후 동기 쿠키로 "user", 곧 /api/session 로 보강(admin 반영).
 *   - canEdit  = admin 이거나 (card.author.id === active 명함 id)  ← 본인/관리자
 *   - canHide  = admin 만
 *   - canReport = 로그인 회원이면서 본인·관리자가 아님(= 타인 글)  ← 신고 대상
 *   - 비로그인 → ⋮ 는 보이되 "신고하기" 클릭 시 로그인 유도(/login?next=현재경로).
 *     (운영 신고 API 는 비로그인도 열려있으나, UX 는 로그인 후가 깔끔 — 본인/타인 판정도 명확.)
 *
 * 동작(운영과 동일 경로 — RLS 가 최종 강제):
 *   - 수정 → getQaEditUrl(card) 로 라우팅(의사 글 /write/{shortcode}, 후기 /review/{shortcode}/edit).
 *   - 삭제 → ConfirmDialog 확인 후 soft_delete_card RPC(운영과 동일 인자) → onDeleted() 로 카드 제거.
 *   - 숨김 → toggle_card_hide RPC(운영과 동일 인자) → router.refresh().
 * 외부클릭/ESC 로 드롭다운 닫기(운영 CardHeader 정합). */
export function PostCardMenu({
  card,
  onDeleted,
}: {
  card: CardData;
  /** 삭제 성공 시 호출 — 호출부가 카드를 화면에서 제거. */
  onDeleted: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  // me — SSR SessionContext 단일 출처(운영 useCardViewer 정합). 로그아웃 → null.
  const me = session
    ? { id: session.activeIdentityId, role: session.role }
    : null;
  const isLoggedIn = !!me;

  // 본인 판정 — card 작성자 명함 id 와 active 명함 id 비교(운영 Card.tsx canEdit 정합).
  const authorId = card.author?.id ?? null;
  const isOwner = isLoggedIn && authorId != null && me.id === authorId;
  const isAdmin = isLoggedIn && me.role === ROLES.ADMIN;
  const canEdit = isOwner || isAdmin;
  const canHide = isAdmin;
  // 신고 — 로그인 회원이면서 본인·관리자가 아닌 "타인 글"에만(SNS 표준). 비로그인은 메뉴는 보이되
  //   클릭 시 로그인 유도하므로, 메뉴에 "신고하기" 항목 자체는 로그인 여부와 무관하게 노출한다.
  const canReport = !canEdit; // 본인/관리자가 아니면(비로그인 포함) 신고 항목 노출.
  const editHref = getQaEditUrl(card);
  const isHidden = card.status === "hidden";

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // "신고하기" 클릭 — 비로그인은 로그인 유도(/login?next=현재경로), 로그인 회원은 신고 모달.
  function onReportClick() {
    setMenuOpen(false);
    if (!isLoggedIn) {
      const next = encodeURIComponent(pathname || "/");
      router.push(`/login?next=${next}`);
      return;
    }
    setReportOpen(true);
  }

  // 외부 클릭 + ESC 로 메뉴 닫기(운영 CardHeader 정합, A11y).
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // 숨김 토글 — 운영 Card.performHide 와 동일 RPC(toggle_card_hide)·인자·확인 흐름.
  async function performHide() {
    const next = isHidden ? "published" : "hidden";
    const confirmMsg = isHidden
      ? "이 글의 숨김을 해제하고 다시 공개로 전환할까요?"
      : "이 글을 숨김 처리할까요?\n관리자/작성자/해당 원장 외에는 보이지 않게 됩니다.";
    if (!window.confirm(confirmMsg)) return;
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.rpc("toggle_card_hide", {
      p_card_id: card.id,
      p_next_status: next,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("forbidden")) {
        showToast("권한이 없어 처리할 수 없어요. 본인/관리자 글만 가능합니다.", {
          tone: "danger",
        });
      } else if (msg.includes("card_not_found")) {
        showToast("카드를 찾을 수 없습니다.", { tone: "danger" });
      } else {
        showToast("숨김 처리 실패: " + msg, { tone: "danger" });
      }
      return;
    }
    showToast(isHidden ? "공개로 전환했어요" : "숨김 처리했어요");
    router.refresh();
  }

  // 삭제 — 운영 Card.performDelete 와 동일 RPC(soft_delete_card)·인자.
  //   성공 시 onDeleted() 로 카드를 화면에서 제거(운영의 vanishing 애니메이션 대신 신규 스킨은 즉시 언마운트).
  async function performDelete() {
    setDeleting(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.rpc("soft_delete_card", { p_card_id: card.id });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("forbidden")) {
          showToast("권한이 없어 삭제할 수 없어요. 본인/관리자 글만 가능합니다.", {
            tone: "danger",
          });
        } else if (msg.includes("card_not_found")) {
          showToast("이미 삭제되었거나 존재하지 않는 카드입니다.", {
            tone: "danger",
          });
        } else {
          showToast("삭제 실패: " + msg, { tone: "danger" });
        }
        setDeleting(false);
        return;
      }
      showToast("글을 삭제했어요");
      setConfirmDeleteOpen(false);
      // 운영 카드 버스와 연동 — 다른 작업자의 FeedView 가 이 이벤트를 수신해
      // 피드 풀에서도 같은 카드를 제거하도록 broadcast(운영 CARD_DELETED detail 형식 일치: { id }).
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(CARD_BUS_EVENTS.CARD_DELETED, {
            detail: { id: card.id },
          }),
        );
      }
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  // 항목이 하나라도 있을 때만 ⋮ 노출. 본인/관리자(canEdit·canHide) 또는 타인 글 신고(canReport).
  //   → 본인/관리자는 기존 그대로, 그 외(타인 글·비로그인)는 "신고하기"만 가진 ⋮ 가 보인다.
  if (!canEdit && !canHide && !canReport) return null;

  return (
    <div
      ref={menuRef}
      className={styles.kebabWrap}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={styles.kebabBtn}
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="더보기"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {menuOpen && (
        <div className={styles.cardMenu} role="menu">
          {canEdit && editHref && (
            <button
              type="button"
              role="menuitem"
              className={styles.cardMenuItem}
              onClick={() => {
                setMenuOpen(false);
                router.push(editHref);
              }}
            >
              수정
            </button>
          )}
          {canHide && (
            <button
              type="button"
              role="menuitem"
              className={styles.cardMenuItem}
              onClick={() => {
                setMenuOpen(false);
                void performHide();
              }}
            >
              {isHidden ? "해제" : "숨기기"}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              role="menuitem"
              className={`${styles.cardMenuItem} ${styles.cardMenuDanger}`}
              onClick={() => {
                setMenuOpen(false);
                setConfirmDeleteOpen(true);
              }}
            >
              삭제
            </button>
          )}
          {/* 타인 글(본인·관리자 아님) → 신고하기. 비로그인은 클릭 시 로그인 유도(onReportClick). */}
          {canReport && (
            <button
              type="button"
              role="menuitem"
              className={`${styles.cardMenuItem} ${styles.cardMenuDanger}`}
              onClick={onReportClick}
            >
              신고하기
            </button>
          )}
        </div>
      )}

      {/* 신고 모달 — 로그인 회원이 타인 글을 신고할 때만. 사유 선택 → /api/reports POST. */}
      {reportOpen && (
        <ReportModal card={card} onClose={() => setReportOpen(false)} />
      )}

      {/* 삭제 확인 다이얼로그 — 운영 Card.tsx 와 동일 문구·tone. */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="이 글을 삭제할까요?"
        description={"삭제하면 되돌릴 수 없어요.\n댓글과 좋아요도 함께 사라집니다."}
        confirmLabel={deleting ? "삭제 중…" : "삭제"}
        cancelLabel="취소"
        tone="danger"
        onConfirm={performDelete}
        onCancel={() => !deleting && setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

export function PostCard({
  card,
  onTagClick,
  isHot = false,
  viewer,
  searchQuery,
  forceExpanded = false,
  onDeleted,
  commentPreview,
  batchedPreview = false,
}: {
  card: CardData;
  /** 항목 4) 카드 태그 클릭 → 그 키워드로 검색·필터 (헤더 검색창에 채움). */
  onTagClick?: (keyword: string) => void;
  /** 운영 홈과 동일 — HOT 카드면 우상단 HOT 딱지. (FeedView 의 hotSet 판정 결과) */
  isHot?: boolean;
  /** 서버 prefetch 한 좋아요/저장 상태 — 첫 렌더부터 정확한 active 표시. */
  viewer?: ViewerState;
  /** 항목1) 현재 검색어 — 본문·제목 노란 하이라이트 + 일치 태그 활성화(검색 결과일 때만). */
  searchQuery?: string;
  /** 글상세 재사용 — 항상 펼친 상태(접기 없음) + 댓글 전체+입력 기본.
   *  글상세를 별도 컴포넌트로 재구현하지 않고 이 PostCard 를 그대로 써서 피드와 100% 동일하게. */
  forceExpanded?: boolean;
  /** ⋮ 삭제 후 동작 — 미지정 시 카드 언마운트(피드). 글상세는 목록(피드=/)으로 이동 등 주입. */
  onDeleted?: () => void;
  /** 피드 배치 미리보기 seed(FeedView 가 페이지당 1회 /api/comments/preview 로 받아 주입).
   *  제공되면 댓글 미리보기를 자체 fetch 없이 렌더 + 배지 = total. 미제공(상세 등)은 기존 fetch. */
  commentPreview?: CommentPreview;
  /** 배치 컨텍스트(FeedView)면 true — 미리보기를 seed 도착 후에만 마운트(N+1 경쟁 차단).
   *  기본 false(상세·프로필 등)는 기존대로 뷰포트 근접 시 CommentsBlock 자체 fetch. */
  batchedPreview?: boolean;
}) {
  const [expanded, setExpanded] = useState(forceExpanded);
  // ⋮ 메뉴 삭제 성공 시 카드를 화면에서 제거(운영의 vanishing 대신 신규 스킨은 즉시 언마운트).
  const [removed, setRemoved] = useState(false);
  // 피드백 2) 댓글 펼침 — 댓글 아이콘 클릭 시 입력창까지 펼침(showInput). 글상세(forceExpanded)는 기본 전체+입력.
  const [commentsOpen, setCommentsOpen] = useState(forceExpanded);
  // 항목4) 댓글 수 0 고정 + 클릭해야만 보임 → 카드가 뷰포트 근처에 오면 CommentsBlock 을 미리보기 모드로
  //   마운트(showInput=false): 운영 CommentsBlock 이 인기순(like_count DESC) 상위 3개를 표시 +
  //   onCountChange 로 실제 댓글 수를 채운다. 전 카드 즉시 fetch 부담을 피하려 IntersectionObserver 지연.
  const [previewReady, setPreviewReady] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  // 댓글 수 배지 — 피드 배치 미리보기(commentPreview.total)가 있으면 그 값으로(자체 fetch 없이),
  //   없으면 card.comment_count(없으면 0)에서 시작해 CommentsBlock onCountChange(펼침 시 전체 로드)로 갱신.
  //   commentPreview 는 FeedView 가 카드 렌더 후 비동기로 채우므로 도착 시 동기화(아래 effect).
  const [commentCount, setCommentCount] = useState(
    commentPreview?.total ?? card.comment_count ?? 0,
  );
  useEffect(() => {
    if (commentPreview) setCommentCount(commentPreview.total);
  }, [commentPreview]);
  useEffect(() => {
    if (previewReady) return;
    const el = cardRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPreviewReady(true);
          ob.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [previewReady]);
  // 좋아요·저장·공유 실제 동작.
  const act = useCardActions(card, viewer);
  // 조회수/노출 기록 — 운영 useCardViewer 그대로 재사용. mount 시 impression(노출) 자동 enqueue,
  //   본문 펼침·댓글 열기 등 "읽음 의도" 시 recordView()로 card_views 기록(세션 dedup, DB 트리거가 카운트).
  //   (신규 스킨 유입이 조회수·노출 통계에서 누락되던 문제 해소.)
  const { recordView } = useCardViewer(card, { forceExpanded, cardRef });
  // 글상세(forceExpanded) 진입 = 명백한 조회·읽음 신호 → mount 시 1회 view 기록(세션 dedup).
  useEffect(() => {
    if (forceExpanded) recordView();
  }, [forceExpanded, recordView]);

  const authorName = card.doctor?.name ?? card.author?.display_name ?? "회원";
  const isDoctor = !!card.doctor && !card.hide_doctor_credential;
  const allTags = card.keywords ?? [];
  const tags = expanded ? allTags : allTags.slice(0, 7);
  // 피드백 1) 본문 끝 평문 "참고문헌\n1. ..." 꼬리 제거(운영 Critical-6 정합).
  //   → 본문 렌더(renderBody)와 PubmedRefs 가 참고문헌을 이중 출력하지 않게.
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
  const displayDate = card.reviewed_at ?? card.created_at;
  const showNew = isNewCard(displayDate);
  const timeAgoLabel = timeAgo(displayDate); // 렌더당 1회 계산(조건·표시 2곳 공용).

  // ⋮ 메뉴에서 삭제 성공 시 카드 언마운트(모든 훅 호출 이후라 조건부 훅 아님 — 안전).
  if (removed) return null;

  const toggle = () => {
    if (forceExpanded) return; // 글상세는 항상 펼침 — 접기 없음.
    if (isLong) {
      setExpanded((v) => !v);
      recordView(); // 본문 펼침 = 읽음 의도 → 조회 기록(세션 1회 dedup).
    }
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
          {timeAgoLabel ? ` · ${timeAgoLabel}` : ""}
          {/* HOT/NEW — ⋮ 와 겹치던 우상단 절대배치(.badges) 폐기. 작성자 메타 줄에 인라인 칩으로.
              둘 다면 NEW → HOT 순. 글상세(forceExpanded)에는 HOT/NEW 미노출(피드 PostCard 만). */}
          {!forceExpanded && showNew && <span className={styles.newBadge}>NEW</span>}
          {!forceExpanded && isHot && <span className={styles.hot}>HOT</span>}
        </div>
      </div>
    </>
  );

  return (
    // 피드백 2) 등장 애니메이션 — 살짝 올라오며 페이드인(무한스크롤 추가 카드 포함).
    <article
      ref={cardRef}
      className={`${styles.card} ${styles.postCard} ${styles.fadeInUp}`}
    >
      {/* HOT/NEW 배지는 작성자 메타 줄(authorSub)로 인라인 이동 — ⋮ 우상단 절대배치와의 겹침 해소.
          기존 .badges absolute 블록은 폐기(아래 authorInner 의 authorSub 참고). */}

      {/* ⋮ 더보기 — 본인 글 수정/삭제 + 관리자 숨김 + 타인 글 신고(SNS 표준, 운영 신고 API 호출).
          항목이 없으면(이론상 거의 없음) 내부에서 null 반환 → 미노출. */}
      <PostCardMenu card={card} onDeleted={onDeleted ?? (() => setRemoved(true))} />

      {/* 작성자 — 실제 프로필 URL 로 같은 창 이동(제목 링크와 동일 동작). 앱 셸 승격으로 프로필도
          인앱 페이지라 새 탭(target=_blank) 폐기 → 화면 안에서 이동. 정보 부족이면 일반 div. */}
      {profileHref ? (
        <a className={styles.author} href={profileHref} onClick={(e) => e.stopPropagation()}>
          {authorInner}
        </a>
      ) : (
        <div className={styles.author}>{authorInner}</div>
      )}

      {/* 항목8) 제목 — 클릭 시 운영 단독 URL(cardHref=getQaUrl, 정규 canonical)로 같은 탭 이동.
          글상세는 항상 이 canonical URL(의사 글·회원 글·리포트)로만 진입. 본문 펼침 토글과 분리(제목은 토글 div 밖).
          hasHref(=href !== "/") 가 false 면(이론상 거의 없음) 링크 대신 일반 제목. */}
      {!forceExpanded && hasHref ? (
        <a
          className={styles.postTitleLink}
          href={href}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className={styles.postTitle}>{highlight(card.title ?? "", searchQuery)}</h2>
        </a>
      ) : (
        <h2 className={styles.postTitle}>{highlight(card.title ?? "", searchQuery)}</h2>
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
            {renderBody(body, hlColor, isLong && !expanded, searchQuery)}
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
          {tags.map((t) => {
            // 통일 태그: 평소 연한 회색(.t), 검색어와 일치할 때만 연한 카테고리 틴트(catTagClass). 띄어쓰기 무시 매칭.
            const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
            const isMatch = !!searchQuery && norm(t) === norm(searchQuery);
            const cls = `${styles.t} ${isMatch ? catTagClass(t) : ""}`;
            return onTagClick ? (
              <button
                type="button"
                className={cls}
                data-cat={catKey(t)}
                key={t}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(t);
                }}
              >
                {t}
              </button>
            ) : (
              <span className={cls} data-cat={catKey(t)} key={t}>
                {t}
              </span>
            );
          })}
        </div>
      )}

      <div className={styles.postFoot}>
        {/* 좋아요 — 실제 toggle_card_like RPC. active 시 pfOn. */}
        <button
          type="button"
          className={`${styles.pf} ${styles.pfBtn} ${act.like.active ? styles.pfOn : ""}${act.like.pulsing ? " like-pulse" : ""}`}
          aria-pressed={act.like.active}
          aria-label="좋아요"
          onClick={(e) => {
            e.stopPropagation();
            act.like.toggle();
          }}
          onAnimationEnd={act.like.clearPulse}
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
            recordView(); // 댓글 열기 = 읽음 의도 → 조회 기록.
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
        <span className={styles.grow} />
        {/* 공유 — 실제 URL 을 navigator.share / clipboard 로 + card_shares INSERT. 우측 정렬. */}
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
      </div>

      {/* 인스타식 좋아요 표시 — 운영 RecentLikers 그대로 재사용(자체 재구현 X).
          운영 Card.tsx 와 동일하게 footer 아래·댓글 블록 위에 마운트. likeCount 는
          act.like.count(toggle 시 갱신) → 좋아요 변동 시 RecentLikers 가 자동 refetch.
          데이터 fetch 경로(get_recent_card_likers_batch)는 운영과 동일(RLS 우회 없음). */}
      <RecentLikers cardId={card.id} likeCount={act.like.count} />

      {/* 항목4) 댓글 섹션 — 뷰포트 근접 시 미리보기(인기순 3개)부터 노출, 💬 클릭 시 입력창까지 펼침.
          showInput={commentsOpen}: false=미리보기 3개 / true=전체+입력. onCountChange 로 실제 수 반영. */}
      {/* 미리보기 마운트:
          - 배치 컨텍스트(FeedView, batchedPreview=true): seed(commentPreview) 도착 후에만 → 카드별 fetch(N+1) 경쟁 차단.
          - 비배치(상세·프로필 등): 기존대로 뷰포트 근접 시 마운트(CommentsBlock 자체 fetch).
          - 💬 클릭(commentsOpen)은 항상 마운트(상세·미배치 전체 fetch 폴백). */}
      {((previewReady && (!batchedPreview || commentPreview !== undefined)) || commentsOpen) && (
        <div
          className={`${styles.comments} ${commentCount > 0 || commentsOpen ? styles.commentsActive : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <CommentsBlock
            cardId={card.id}
            doctorSlug={card.doctor?.slug ?? null}
            cardDoctorId={card.doctor?.id ?? null}
            isPublishedQa
            showInput={commentsOpen}
            disableAutoFocus
            onCountChange={setCommentCount}
            initialComments={commentPreview?.comments}
            initialTotal={commentPreview?.total}
            onExpandRequest={() => {
              // "댓글 N개 모두 보기" 줄 클릭 — 💬 토글과 동일 효과이되 펼침 고정(이미 열려 있으면 유지).
              setCommentsOpen(true);
              recordView(); // 댓글 열기 = 읽음 의도 → 조회 기록.
            }}
          />
        </div>
      )}
      <LoginPromptDialog
        open={!!act.loginPrompt}
        message={act.loginPrompt ?? ""}
        onClose={act.dismissLoginPrompt}
      />
    </article>
  );
}


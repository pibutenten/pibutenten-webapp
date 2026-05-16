"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CATEGORIES } from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import { PICK_IDS } from "@/lib/picks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CommentsBlock from "@/components/CommentsBlock";
import RecentLikers from "@/components/RecentLikers";
import { getQaEditUrl } from "@/lib/card-url";
import { getActiveIdentityId } from "@/lib/active-identity";
import { labelForCategory } from "@/lib/post-category";
import { pickHighlight } from "@/lib/card-highlight";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { shareCard } from "@/components/card/utils/card-share";
import { useCardBus } from "@/components/card/hooks/useCardBus";
import { useCardEngagement } from "@/components/card/hooks/useCardEngagement";
import { useCardViewer } from "@/components/card/hooks/useCardViewer";
import CardHeader from "@/components/card/CardHeader";
import CardMedia from "@/components/card/CardMedia";
import CardBody from "@/components/card/CardBody";
import CardActions from "@/components/card/CardActions";

export type CardData = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  share_count?: number;
  comment_count?: number;
  /** v4 — 저장(북마크) 누적 수 (cards.save_count) */
  save_count?: number;
  type?: "card" | "post" | "link";
  created_at?: string;
  /** §2 SEO URL — /doctors/{slug}/{year}/{postSlug} canonical 생성용 */
  post_year?: number | null;
  post_slug?: string | null;
  /** v4 — 회원 글 URL용 8자 base58 식별자 */
  shortcode?: string | null;
  /** 외부 링크 — 모든 카테고리에서 옵션 (Phase 3). card 카테고리 외에서는 카드에 [더 알아보기] 버튼 노출 */
  external_url?: string | null;
  external_title?: string | null;
  external_description?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  /** 글 분류 카테고리 (Phase 2) */
  category?: string | null;
  /** 의사 직함 숨김 (Phase A.2) — true면 사적 모드, "피부과 전문의" 배지 숨김 */
  hide_doctor_credential?: boolean | null;
  /** Phase 6 — 카드 하단 ref. 박스용 PubMed 단일 참고문헌. (legacy, 호환성 유지) */
  pubmed_ref?: {
    pmid?: string | null;
    doi?: string | null;
    title?: string | null;
    journal?: string | null;
    year?: string | null;
    authors_short?: string | null;
    pubmed_url?: string | null;
    doi_url?: string | null;
    reasoning?: string | null;
  } | null;
  /** Phase 9 (0054) — 멀티 참고문헌 배열. 있으면 우선, 없으면 pubmed_ref 사용 */
  pubmed_refs?: Array<{
    pmid?: string | null;
    doi?: string | null;
    title?: string | null;
    journal?: string | null;
    year?: string | null;
    authors_short?: string | null;
    pubmed_url?: string | null;
    doi_url?: string | null;
    reasoning?: string | null;
  }> | null;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    /** v4 — 회원 핸들 (URL용) */
    handle?: string | null;
    /** v4 — avatar cache buster용. profile.updated_at (avatar 변경 시 갱신) */
    updated_at?: string | null;
  } | null;
  video: {
    youtube_id: string;
    youtube_url: string;
    topic: string | null;
    upload_date: string | null;
  } | null;
};

/**
 * Q&A 카드.
 * - 본문 클릭 → 부드럽게 펼치기/접기 토글
 * - 원장님 아바타 뒤 파스텔 배경 (식별성)
 * - fadeInUp 애니메이션
 */
type Props = {
  card: CardData;
  /** 검색어 — 일치하는 태그 칩은 카테고리 색, 본문은 노란 mark */
  activeQuery?: string;
  /** 칩 클릭 시 검색 URL에 boost로 함께 전달 (원장님 단일 페이지에서 사용) */
  boostDoctorSlug?: string;
  /** 이 카드가 HOT인지 (서버에서 계산한 hot id set 기준) */
  isHot?: boolean;
  /** 단독 페이지(/doctors/{slug}/{year}/{slug}, /[handle]/[shortcode])에서 사용 — 댓글 자동 열림 */
  autoExpandComments?: boolean;
  /** 단독 페이지: 본문 자동 펼침 (line-clamp 해제). 짧은 글이면 영향 없음. */
  forceExpanded?: boolean;
  /** 단독 페이지: 질문을 h1으로 렌더 (페이지당 h1 1개 룰). 피드/리스트에서는 h2 유지. */
  asH1?: boolean;
  /** v4 — viewer의 좋아요/저장 초기 상태 (server prefetch).
   * 있으면 useEffect fetch 생략 → 카드가 즉시 정확한 상태로 렌더 (2~3초 지연 제거). */
  viewerLiked?: boolean;
  viewerSaved?: boolean;
};

// 카드별 결정적 형광펜 색은 lib/card-highlight.ts 의 pickHighlight 사용
// (Yellow / Mint / Lavender / Sky Blue 4색 — 카드 ID 해시로 결정. SSR safe)

export default function Card({
  card,
  activeQuery,
  boostDoctorSlug,
  isHot = false,
  autoExpandComments = false,
  forceExpanded = false,
  asH1 = false,
  viewerLiked,
  viewerSaved,
}: Props) {
  const highlightColor = pickHighlight(
    String(card.shortcode ?? card.post_slug ?? card.id ?? "")
  );
  const [expanded, setExpanded] = useState(forceExpanded);
  const [commentCount, setCommentCount] = useState(card.comment_count ?? 0);
  // 단독 페이지에서는 댓글창 자동 열림 (autoExpandComments)
  const [commentsOpen, setCommentsOpen] = useState(autoExpandComments);
  // 카드 간 broadcast 통합 (Phase 4-2): comments-opened·card-deleted·card-viewed
  // 20번 — 모바일: 다른 카드 댓글창 열리면 본 카드 댓글창 닫기 (focus single).
  //   데스크탑은 이 이벤트 미발사 (송신 측에서 width 768 분기).
  const cardBus = useCardBus(card.id, {
    onOtherCommentsOpened: () => setCommentsOpen(false),
  });
  // 비로그인 사용자가 로그인 필요 액션 시도 시 띄울 모달 (인스타·트위터 표준 UX)
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  // Phase 4-4: viewer 컨텍스트 통합 (me / viewCount / recordView / impression / dwell)
  const viewer = useCardViewer(card, {
    forceExpanded,
    cardRef,
    onViewed: cardBus.emitCardViewed,
  });
  const me = viewer.me;
  const viewCount = viewer.viewCount;
  const recordView = viewer.recordView;
  // Phase 4-3: like/save/share state + handler 통합
  const eng = useCardEngagement(
    card,
    { liked: viewerLiked, saved: viewerSaved },
    me,
    setAuthPrompt,
    shareCard,
  );
  // (인라인 편집 모드는 현재 UI 트리거 없음 — kebab '수정' 메뉴는 항상 /write/[shortcode] 로
  //  navigate. <CardEditMode> 컴포넌트는 future-ready 로 components/card/ 폴더에 유지.)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 24번 — 삭제 성공 후 카드가 fade-out + collapse 후 사라지는 애니메이션
  const [vanishing, setVanishing] = useState(false);
  const router = useRouter();
  const doctor = card.doctor;
  const isPick = PICK_IDS.has(card.id);

  // 노출/조회/dwell observer — useCardViewer 훅으로 통합됨 (Phase 4-4).
  // 좋아요/저장/공유 — useCardEngagement 훅으로 통합됨 (Phase 4-3).
  // 작성자 row / 배지 / 메뉴 — CardHeader 컴포넌트로 분리됨 (Phase 4-6).

  // 검색어가 어느 카테고리에 속하는지 판정 → 칩 강조 색
  // 단, 글 카테고리 라벨(Q&A/꿀팁/피부일기/궁금해요/소식공유/끄적끄적)이면 콘텐츠 카테고리 추정 X
  // (그 라벨은 search/page.tsx 에서 category 컬럼 직접 필터로 분기됨)
  const POST_CATEGORY_LABELS = new Set([
    "Q&A", "피부꿀팁", "피부일기", "궁금해요", "소식공유", "끄적끄적",
  ]);
  const queryCategoryColor =
    activeQuery && !POST_CATEGORY_LABELS.has(activeQuery)
      ? CATEGORIES.find((c) => c.slug === categorize(activeQuery))?.color
      : null;

  // me 결정 — useCardViewer 훅에 통합됨 (Phase 4-4).

  // 옛 mount 즉시 qa_views INSERT는 제거됨 (옵션 A 적용 — 의도 신호일 때만).
  // 노출(impression)은 위쪽 useEffect에서, 조회(view)는 recordView()에서 처리.

  // 메뉴 외부 클릭 시 닫기 — CardHeader 내부로 이전 (Phase 4-6).

  // 수정/삭제 권한 (정책 재정의 2026-05-15):
  //   - active=admin: 모든 글
  //   - 그 외: active profile.id == card.author?.id 일 때만 (active 단일 매칭)
  //     → 같은 묶음의 다른 ID 로 쓴 글은 ⋮ 안 보임. 그 ID 로 전환해야 편집 가능.
  const canEdit =
    !!me &&
    (me.role === "admin" ||
      (card.author?.id != null && me.id === card.author.id));

  async function performDelete() {
    setDeleting(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.from("cards").delete().eq("id", card.id);
      if (error) {
        alert("삭제 실패: " + error.message);
        setDeleting(false);
        return;
      }
      setConfirmDeleteOpen(false);

      // 24번 — 카드 사라지는 애니메이션 (fade-out + collapse).
      // 1) vanishing=true → CSS transition 으로 max-height/opacity/margin 축소 (320ms)
      // 2) 단일 페이지면 push, 피드면 dispatch + refresh (애니메이션 이후)
      const path = window.location.pathname;
      const isSinglePage =
        (card.post_slug && path.includes(`/${card.post_slug}`)) ||
        (card.shortcode && path.endsWith(`/${card.shortcode}`));

      if (isSinglePage) {
        // 단일 페이지 — 즉시 이동 (페이지 자체가 사라지므로 카드 애니메이션 의미 없음)
        router.push("/");
        return;
      }

      // 피드/검색/대시보드 — 카드 자체에 vanishing 애니메이션 적용
      setVanishing(true);
      setTimeout(() => {
        cardBus.emitCardDeleted();
        router.refresh();
      }, 340);
    } catch (e) {
      void e;
      setDeleting(false);
    }
  }

  // 24시간 내 글 → NEW 배지
  const isNew = (() => {
    if (!card.created_at) return false;
    const t = new Date(card.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < 24 * 60 * 60 * 1000;
  })();

  // 본문 길이 — 짧으면 "더보기" 토글 비표시 (250자 미만 또는 줄바꿈 5줄 미만)
  const answerLines = (card.answer ?? "").split("\n").length;
  const isLongAnswer = (card.answer?.length ?? 0) > 250 || answerLines >= 6;

  return (
    <article
      ref={cardRef}
      // 24번 — vanishing=true 면 fade-out + collapse 애니메이션 (삭제 직후).
      //   Phase 6-1: cubic-bezier(0.4, 0, 0.2, 1) — Material Design standard easing.
      //     opacity 먼저 빠르게(180ms) 사라지고, max-height/margin/padding 이 좀 더
      //     긴 시간(340ms)에 걸쳐 collapse → 아래 카드들이 자연스럽게 슬쩍 올라옴.
      //   transition 종료 직후 (시간 = 340ms) Card.tsx 의 setTimeout 이
      //   cardBus.emitCardDeleted() 를 발사 → Feed.tsx 가 items 에서 제거 → unmount.
      style={
        vanishing
          ? {
              maxHeight: 0,
              opacity: 0,
              marginTop: 0,
              marginBottom: 0,
              paddingTop: 0,
              paddingBottom: 0,
              overflow: "hidden",
              transform: "scale(0.96)",
              transition:
                "max-height 340ms cubic-bezier(0.4, 0, 0.2, 1)," +
                " opacity 180ms ease-out," +
                " transform 280ms cubic-bezier(0.4, 0, 0.2, 1)," +
                " margin 340ms cubic-bezier(0.4, 0, 0.2, 1)," +
                " padding 340ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "max-height, opacity, transform",
            }
          : undefined
      }
      className="fade-in-up relative rounded-[var(--radius)] bg-white p-[18px_20px]"
    >
      <CardHeader
            card={card}
            isHot={isHot}
            isNew={isNew}
            isPick={isPick}
            canEdit={canEdit}
            editHref={getQaEditUrl(card)}
            onDeleteClick={() => setConfirmDeleteOpen(true)}
          />

          <CardBody
            card={card}
            activeQuery={activeQuery}
            asH1={asH1}
            isLongAnswer={isLongAnswer}
            expanded={expanded}
            forceExpanded={forceExpanded}
            highlightColor={highlightColor}
            onExpandToggle={() => {
              // 펼침 클릭 = 명확한 의도 → 조회 카운트 (recordView가 session dedup)
              if (!expanded) recordView();
              setExpanded((v) => !v);
            }}
          />
      <CardMedia card={card} onWatchClick={recordView} />

      {/* 태그 칩 — 사용자 키워드 + 자동 카테고리 칩(맨 끝).
          v5.2: 카테고리 라벨(끄적끄적/피부일기/피부꿀팁/궁금해요/소식공유/Q&A) 을
          모든 글의 태그 맨 끝에 자동 append. 클릭하면 /search?q=라벨 로 같은
          카테고리 글만 보임. 사용자 직접 입력은 받지 않음 (자동). */}
      {(() => {
        // 옛 데이터에 사용자가 직접 입력한 카테고리 라벨이 있으면 중복 방지로 제거
        const CATEGORY_LABELS = [
          "Q&A", "답해드려요",
          "꿀팁", "피부꿀팁",
          "피부일기",
          "물어봐요", "궁금해요",
          "새소식", "공유하기", "소식공유",
          "끄적끄적",
        ];
        const userKeywords = card.keywords.filter(
          (k) => !CATEGORY_LABELS.includes(k),
        );
        // 현재 글의 category 라벨을 마지막에 자동 추가
        const categoryLabel = card.category
          ? labelForCategory(card.category)
          : null;
        const visibleKeywords = categoryLabel
          ? [...userKeywords, categoryLabel]
          : userKeywords;
        if (visibleKeywords.length === 0) return null;
        return (
        <Keywords
          keywords={visibleKeywords}
          activeQuery={activeQuery}
          queryCategoryColor={queryCategoryColor ?? null}
          forceShowAll={expanded || forceExpanded}
          onPick={(kw) => {
            const params = new URLSearchParams({ q: kw });
            if (boostDoctorSlug) params.set("boost", boostDoctorSlug);
            // v3 URL 정책: 검색은 /search 로 분리됨
            router.push(`/search?${params.toString()}`);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
        );
      })()}

      <CardActions
        engagement={eng}
        commentCount={commentCount}
        onToggleComments={() => {
          // 20번 — 모바일: 다른 카드 댓글창 열려 있으면 닫음 (포커스 이동 자연스럽게).
          // 데스크탑은 그대로 유지 (병렬 편집 가능). 훅 내부에서 768px 분기.
          setCommentsOpen((v) => {
            const next = !v;
            if (next) cardBus.emitCommentsOpened();
            return next;
          });
        }}
      />

      {/* 인스타식 좋아요 표시 — 구분선 아래, 댓글 블록 바로 위. 좋아요 1+ 일 때만 노출. */}
      <RecentLikers cardId={card.id} likeCount={eng.like.count} />

      {/* 댓글 블록 — 댓글 있거나 댓글창 열린 상태일 때만 표시 (본문 펼침과 무관) */}
      <CommentsBlock
        cardId={card.id}
        doctorSlug={card.doctor?.slug ?? null}
        isPublishedQa={true}
        onCountChange={setCommentCount}
        showInput={commentsOpen}
        disableAutoFocus={autoExpandComments}
      />

      {/* 삭제 확인 다이얼로그 */}
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

      {/* 비로그인 상태에서 좋아요/저장 시도 시 — 인스타·트위터 표준 UX */}
      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// Keywords — 컨테이너 너비에 맞춰 한 줄에 들어가는 만큼만 노출 + +N 토글
// ────────────────────────────────────────────────────────────
const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] whitespace-nowrap";
const CHIP_DEFAULT_STYLE: React.CSSProperties = {
  backgroundColor: "#F0F2F5",
  color: "#8A8F99",
  fontWeight: 500,
};

function Keywords({
  keywords,
  activeQuery,
  queryCategoryColor,
  onPick,
  forceShowAll = false,
}: {
  keywords: string[];
  activeQuery?: string;
  queryCategoryColor: string | null;
  onPick: (kw: string) => void;
  /** 카드 본문 펼침 / 단독 페이지 진입 시 태그도 자동 펼침 */
  forceShowAll?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showAllLocal, setShowAllLocal] = useState(false);
  const showAll = forceShowAll || showAllLocal;
  const setShowAll = setShowAllLocal;
  // 초기값: 모든 태그 노출(SSR HTML에는 한 번만 등장).
  // 클라이언트에서 첫 줄 측정 후 fitCount 조정 → +N 배지 표시.
  const [fitCount, setFitCount] = useState<number>(keywords.length);

  // 측정: DOM에 detached probe div를 잠깐 만들어 첫 줄에 맞는 칩 갯수 계산.
  //  → 별도 측정 div를 마크업에 두지 않음 (검색엔진/AI 태그 스터핑 방지)
  useLayoutEffect(() => {
    if (showAll) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof document === "undefined") return;

    const measure = () => {
      const w = wrapper.clientWidth;
      if (w === 0) return;
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:absolute;left:-99999px;top:-99999px;width:${w}px;display:flex;flex-wrap:wrap;gap:4px;visibility:hidden;`;
      for (const kw of keywords) {
        const span = document.createElement("span");
        span.className = CHIP_BASE_CLASS;
        span.style.backgroundColor = "#F0F2F5";
        span.style.color = "#8A8F99";
        span.style.fontWeight = "500";
        span.textContent = kw;
        probe.appendChild(span);
      }
      document.body.appendChild(probe);
      const chips = Array.from(probe.children) as HTMLElement[];
      let count = chips.length;
      if (chips.length > 0) {
        const firstTop = chips[0].offsetTop;
        for (let i = 1; i < chips.length; i++) {
          if (chips[i].offsetTop > firstTop + 2) {
            count = Math.max(0, i - 1); // +N 배지 자리 확보
            break;
          }
        }
      }
      document.body.removeChild(probe);
      setFitCount(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [keywords, showAll]);

  const visible = showAll ? keywords : keywords.slice(0, fitCount);
  const hidden = keywords.length - visible.length;

  return (
    <div ref={wrapperRef} className="relative mb-2 mt-2.5">
      {/* 스크린리더 + LLM/검색엔진용 텍스트 — 콤마 구분으로 단어 경계 명시 (D-4) */}
      <span className="sr-only">태그: {keywords.join(", ")}</span>
      {/* 실제 노출 — collapse 상태일 때 한 줄, 펼친 상태일 때만 wrap */}
      <div
        aria-hidden="true"
        className={
          "flex gap-1 py-px " +
          (showAll ? "flex-wrap" : "flex-nowrap overflow-x-hidden")
        }
      >
        {visible.map((kw) => {
          const matched = activeQuery && kw === activeQuery;
          return (
            <button
              key={kw}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(kw);
              }}
              className={
                CHIP_BASE_CLASS +
                " cursor-pointer transition-colors hover:shadow-sm"
              }
              style={
                matched && queryCategoryColor
                  ? {
                      backgroundColor: queryCategoryColor + "1A",
                      borderColor: queryCategoryColor,
                      color: queryCategoryColor,
                      fontWeight: 700,
                    }
                  : CHIP_DEFAULT_STYLE
              }
            >
              {kw}
            </button>
          );
        })}
        {!showAll && hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ backgroundColor: "#F0F2F5", color: "#8A8F99" }}
          >
            +{hidden}
          </button>
        )}
        {showAll && keywords.length > 0 && !forceShowAll && (
          /* "접기" 는 태그가 아니므로 칩 디자인 X — 연한 회색 inline 텍스트 (본문 더보기와 동일 톤).
             6번 — forceShowAll(글 단독 페이지) 일 때는 접기 자체 미노출 (사용자 요청). */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(false);
            }}
            className="inline-flex cursor-pointer items-center whitespace-nowrap px-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}

// shareCard / showToast / renderAnswerBody / highlight / absoluteDateTimeLabel
// 모두 ./card/utils/* 로 추출됨 (Phase 4-1).

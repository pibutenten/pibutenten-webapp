"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
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
import { ROLES } from "@/lib/identity-shared";
import {
  labelForCategory,
  POST_CATEGORY_LABELS,
  stripCategoryLabels,
} from "@/lib/post-category";
import { pickHighlight } from "@/lib/card-highlight";
import { addEngagement } from "@/lib/engagement-score";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { shareCard } from "@/components/card/utils/card-share";
import { showToast } from "@/lib/toast";
import { useCardBus } from "@/components/card/hooks/useCardBus";
import { useCardEngagement } from "@/components/card/hooks/useCardEngagement";
import { useCardViewer } from "@/components/card/hooks/useCardViewer";
import CardHeader from "@/components/card/CardHeader";
import CardMedia from "@/components/card/CardMedia";
import CardBody from "@/components/card/CardBody";
import ReviewSummary from "@/components/card/ReviewSummary";
import CardActions from "@/components/card/CardActions";
import HeartOverlay from "@/components/card/HeartOverlay";
import Keywords from "@/components/card/CardKeywords";

// CardData 타입은 @/lib/types/card 로 외부화 — 기존 `from "@/components/Card"` import 경로는
// re-export 통해 그대로 유지 (점진적으로 직접 import 권장).
// 2026-05-28: CardDataList (list 컨텍스트) / CardDataDetail (단일 글) alias 도 함께 re-export.
export type { CardData, CardDataList, CardDataDetail } from "@/lib/types/card";
import type { CardData } from "@/lib/types/card";

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
  // 2026-05-20: 인터랙션 성공 시 recordView 호출 — 명백한 의도 신호이므로 view 카운트.
  //   session dedup 은 recordView 내부 sessionStorage 가드가 처리 → 좋아요+공유 모두 해도 1회만.
  const eng = useCardEngagement(
    card,
    { liked: viewerLiked, saved: viewerSaved },
    me,
    setAuthPrompt,
    shareCard,
    recordView,
  );
  // 인라인 편집 모드 없음 — kebab '수정' 메뉴는 항상 /write/[shortcode] 로 navigate.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 24번 — 삭제 성공 후 카드가 fade-out + collapse 후 사라지는 애니메이션
  const [vanishing, setVanishing] = useState(false);
  const router = useRouter();
  const doctor = card.doctor;
  const isPick = PICK_IDS.has(card.id);

  // ── 더블탭 좋아요 하트 오버레이 (2026-06-25 UX 개선) ──
  const [showHeart, setShowHeart] = useState(false);
  const lastTap = useRef(0);
  const handleBodyTap = useCallback((e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("a, button, [role='button'], input, textarea, select")) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      eng.handleDoubleTap();
      setShowHeart(true);
    }
    lastTap.current = now;
  }, [eng]);

  // 노출/조회/dwell observer — useCardViewer 훅으로 통합됨 (Phase 4-4).
  // 좋아요/저장/공유 — useCardEngagement 훅으로 통합됨 (Phase 4-3).
  // 작성자 row / 배지 / 메뉴 — CardHeader 컴포넌트로 분리됨 (Phase 4-6).

  // 검색어가 어느 카테고리에 속하는지 판정 → 칩 강조 색
  // 단, 글 카테고리 라벨(v5.2)이면 콘텐츠 카테고리 추정 X — search/page.tsx 가 category 직접 분기.
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
    (me.role === ROLES.ADMIN ||
      (card.author?.id != null && me.id === card.author.id));

  // 숨김(hidden) 토글 — admin 이면 무조건 메뉴 항목 노출.
  // RPC 기반 피드(feed_cards_scored)는 status 컬럼이 빠져 있어 undefined 가능 →
  // admin 권한만 보고 노출. 일반 사용자는 RLS 가 published 만 노출하므로 hidden
  // 카드가 list 에 들어오지 않음 (안전).
  const canHide = !!me && me.role === ROLES.ADMIN;
  const isHidden = card.status === "hidden";

  // 숨김/공개 토글 — 0162 toggle_card_hide RPC 호출 (계정 단위 권한 검증 + admin EditClient
  // handleToggleHide 와 일관 진입점). 이전 직접 cards.update({status}) 패턴 → RPC 통일.
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
        showToast("권한이 없어 처리할 수 없어요. 본인/관리자 글만 가능합니다.", { tone: "danger" });
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

  async function performDelete() {
    setDeleting(true);
    try {
      const sb = createSupabaseBrowserClient();
      // soft-delete via SECURITY DEFINER RPC (0156).
      // 배경: 직접 `cards.update({deleted_at})` 호출은 type='qa' 등 일부 카드에서
      //       RLS WITH CHECK 가 sub-select 패턴을 미묘하게 막아
      //       "new row violates row-level security policy for table 'cards'" 에러 발생
      //       (정책 표현식 자체는 직접 평가 시 TRUE — PostgreSQL RLS evaluator 이슈로 추정).
      //       `soft_delete_card(p_card_id)` RPC 가 권한 체크 + UPDATE 를
      //       SECURITY DEFINER 컨텍스트에서 처리 — RLS 우회 + 권한 명시 검증.
      const { error } = await sb.rpc("soft_delete_card", { p_card_id: card.id });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("forbidden")) {
          showToast("권한이 없어 삭제할 수 없어요. 본인/관리자 글만 가능합니다.", { tone: "danger" });
        } else if (msg.includes("card_not_found")) {
          showToast("이미 삭제되었거나 존재하지 않는 카드입니다.", { tone: "danger" });
        } else {
          showToast("삭제 실패: " + msg, { tone: "danger" });
        }
        setDeleting(false);
        return;
      }
      showToast("글을 삭제했어요");
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
    } catch {
      // R2-3 (2026-07-04): 네트워크 예외 등 — 종전 무언 삼킴을 danger 토스트로 교체.
      //   vanishing·emitCardDeleted 미실행이라 카드 목록 상태는 불변(확인 다이얼로그 유지 → 재시도 가능).
      showToast("삭제에 실패했어요. 네트워크를 확인해 주세요.", {
        tone: "danger",
      });
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
  const answerLines = (card.body ?? "").split("\n").length;
  const isLongAnswer = (card.body?.length ?? 0) > 250 || answerLines >= 6;

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
      // 숨김 상태 글 — 카드 바탕 회색 (#EEEEEE) 으로 시각적 구분 (admin 시야에서만 노출됨)
      className={
        "fade-in-up relative rounded-[var(--radius)] p-[18px_20px] " +
        (isHidden ? "bg-[#EEEEEE]" : "bg-white")
      }
    >
      <CardHeader
            card={card}
            isHot={isHot}
            isNew={isNew}
            isPick={isPick}
            canEdit={canEdit}
            editHref={getQaEditUrl(card)}
            onDeleteClick={() => setConfirmDeleteOpen(true)}
            canHide={canHide}
            isHidden={isHidden}
            onHideClick={performHide}
          />

      {/* 더블탭 좋아요 영역 — CardBody + CardMedia 를 감싸서 더블클릭 시 하트 오버레이 표시.
           CardBody 내부 onClick(펼침/접기) 은 그대로 동작 — 단일 클릭은 lastTap 간격 ≥300ms. */}
      <div className="relative" onTouchEnd={handleBodyTap}>
          <CardBody
            card={card}
            activeQuery={activeQuery}
            asH1={asH1}
            isLongAnswer={isLongAnswer}
            expanded={expanded}
            forceExpanded={forceExpanded}
            highlightColor={highlightColor}
            /* 시술후기(type=review) 정량 요약 — 제목 바로 아래에 한 줄 텍스트로.
               임베드(procedure_review) 가 객체/배열 어느 쪽이든 깨지지 않게 정규화. */
            afterTitle={(() => {
              if (card.type !== "review") return null;
              const pr = card.procedure_review;
              const review = Array.isArray(pr) ? pr[0] : pr;
              return review ? <ReviewSummary review={review} /> : null;
            })()}
            onExpandToggle={() => {
              // 펼침 클릭 = 명확한 의도 → 조회 카운트 (recordView가 session dedup)
              // + 비로그인 흥미 점수 +2 (깊이 읽음 신호)
              if (!expanded) {
                recordView();
                addEngagement("card-expand");
              }
              setExpanded((v) => !v);
            }}
          />
        <CardMedia
          card={card}
          onWatchClick={() => {
            recordView();
            addEngagement("video-click");
          }}
        />
        {showHeart && <HeartOverlay onDone={() => setShowHeart(false)} />}
      </div>

      {/* 태그 칩 — 사용자 키워드 + 자동 카테고리 칩(맨 끝).
          v5.2: 카테고리 라벨(끄적끄적/피부일기/피부꿀팁/궁금해요/소식공유/Q&A) 을
          모든 글의 태그 맨 끝에 자동 append. 클릭하면 /search?q=라벨 로 같은
          카테고리 글만 보임. 사용자 직접 입력은 받지 않음 (자동). */}
      {(() => {
        // 옛 데이터에 사용자가 직접 입력한 카테고리 라벨이 있으면 중복 방지로 제거 (lib/category-labels SSOT)
        const userKeywords = stripCategoryLabels(card.keywords);
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
            // 검색은 운영 홈 피드(/?q=)로 통일(구 /search 폐기 → 308 hop 제거).
            router.push(`/?${params.toString()}`);
            // 비로그인 흥미 점수 +1 (태그/카테고리 chip 클릭 = 탐색 의도)
            addEngagement("chip-click");
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
          // 단독글 페이지(autoExpandComments)는 댓글창이 항상 열려 있어야 하므로 토글 차단.
          // forceExpanded 본문 접기 차단과 동일 패턴.
          if (autoExpandComments) return;
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
        cardDoctorId={card.doctor?.id ?? null}
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


// shareCard / showToast / renderAnswerBody / highlight / absoluteDateTimeLabel
// 모두 ./card/utils/* 로 추출됨 (Phase 4-1).

"use client";

/**
 * Viewer (보는 사람) 컨텍스트 통합 훅 (ADR 0012 정합).
 *
 * 책임:
 *  1) me 결정 — SessionContext (SSR) 단일 출처. active profile.id + role.
 *     - 비로그인 → me = null (SSR 시점 결정 — race window 없음)
 *     - 로그인 → me = { id, role }
 *  2) viewCount 카운터 (낙관적 +1)
 *  3) impression — mount 시 1회 enqueue (session dedup)
 *  4) recordView — 의도 신호 발생 시 호출 (session_id 기반 dedup, DB 트리거가 view_count 갱신)
 *
 * 외부 인터페이스:
 *   const viewer = useCardViewer(card, { forceExpanded, cardRef, onViewed });
 *   viewer.me / viewer.viewCount / viewer.recordView()
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CardData } from "@/components/Card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { enqueueImpression } from "@/lib/impression-queue";
import { useSession } from "@/lib/session-context";
import { addEngagement } from "@/lib/engagement-score";
import { ssGet, ssSet } from "@/lib/safe-storage";

// ADR 0012 정합: SessionContext (SSR) 가 me 의 단일 출처.
// 옛 client supabase.auth.getUser() + profiles select useEffect 제거 — 카드 N장 당
// RPC 2회 호출 폭주 차단 + 첫 paint 이후 me 깜빡임 차단.

export type ViewerMe =
  | { id: string; role: "admin" | "doctor" | "user" }
  | null
  | undefined;

export type UseCardViewerOptions = {
  forceExpanded: boolean;
  /** dwell observer가 attach할 DOM element ref. */
  cardRef: RefObject<HTMLElement | null>;
  /** card_views INSERT 성공 시 호출 — useCardBus.emitCardViewed 전달 권장. */
  onViewed?: () => void;
};

export type UseCardViewer = {
  me: ViewerMe;
  viewCount: number;
  recordView: () => void;
};

const DWELL_MIN_MS = 4000;
const DWELL_MAX_MS = 10000;
const SID_KEY = "pibutenten:sid";

export function useCardViewer(
  card: CardData,
  options: UseCardViewerOptions,
): UseCardViewer {
  const { forceExpanded, cardRef, onViewed } = options;
  // ADR 0012 정합 (2026-05-26): SessionContext (SSR) 단일 출처. useEffect 제거.
  //   옛: SSR 초기값 + useEffect 안 client supabase.auth.getUser() + profiles select
  //       → 카드 1장당 RPC 2회 (페이지 카드 20장이면 40회) + 첫 paint 후 me 깜빡임.
  //   새: SSR session 만 사용. me 는 render 즉시 결정 — race window 없음.
  //   2026-05-20 회귀 (비로그인 좋아요 클릭 시 모달 안 뜸) 은 ssrSession === null 명시
  //       반환으로 차단 — 기존과 동일.
  const ssrSession = useSession();
  const me: ViewerMe =
    ssrSession === null
      ? null
      : { id: ssrSession.activeIdentityId, role: ssrSession.role };
  const [viewCount, setViewCount] = useState(card.view_count);

  // onViewed가 매 렌더마다 새 함수여도 effect 의존성에 안 걸리도록 ref로 고정
  const onViewedRef = useRef(onViewed);
  useEffect(() => {
    onViewedRef.current = onViewed;
  }, [onViewed]);

  // ── 2) impression — mount 1회 enqueue ──
  // 노출(impression) +1 — 큐에 enqueue (session 1회 dedup은 sessionStorage로 차단).
  // 조회(view)와 분리: 노출 = 단순 등장, 조회 = 의도 신호.
  // engagement rate = view_count / impression_count 로 인기도 평가 가능.
  // DB trigger가 cards.impression_count 자동 +1. 큐가 800ms 디바운스 모음 INSERT.
  //
  // 2026-05-20: 옛 `if (forceExpanded) return` 가드 제거.
  //   배경: 가드로 인해 단독 페이지(카카오톡 공유·검색 직접 진입 등) 사용자는
  //   impression 0건 → 방문자 통계에서 통째 누락되던 회귀 (실측 결과: 24h 8명이
  //   view 남겼는데 impression 사용자는 2명만). 단독 진입도 명백한 방문 신호이므로
  //   카운트 포함.
  // 활성 명함 id 를 render 시점에 확정 — impKey(명함 단위 dedup)와 effect 의존성에 사용.
  //   getActiveIdentityId() 는 쿠키/모듈 캐시 기반이라 세션 내에서 안정적이지만,
  //   명함 전환은 앱 전역 재마운트를 동반하므로 값 변경이 render 에 반영됩니다.
  const activeIdForImp = getActiveIdentityId() ?? "anon";
  useEffect(() => {
    if (typeof window === "undefined") return;
    // dedup 키에 활성 명함 id 포함 — 같은 세션에서 명함을 전환하면 각 명함이 노출 1회씩
    //   집계되도록(노출 집계를 명함 단위로 귀속). 명함 미포함 키였던 옛 버전은 명함을 바꿔도
    //   재집계되지 않던 결함이 있었습니다.
    const impKey = `pibutenten:imp:${activeIdForImp}:${card.id}`;
    // safe-storage (R2-3): 인앱 브라우저 sandbox 에서 storage 접근이 throw 해도 크래시 없이
    //   dedup 만 degrade (같은 세션 재노출 가능 — 트래킹 정확도만 영향, UX 무해).
    if (ssGet(impKey)) return;
    ssSet(impKey, "1");
    enqueueImpression(card.id);
    // 의존성에 activeIdForImp 포함 — 명함 전환이 런타임에 반영되면 새 명함으로 1회 재집계.
    //   활성 명함 id 는 세션 내 안정적이라 과도한 재실행은 없습니다.
  }, [card.id, activeIdForImp]);

  // ── 3) recordView ──
  // card_views.insert만 호출. DB trigger가 cards.view_count도 자동 +1 동기화.
  // session_id 기반 dedup — 같은 세션 같은 card는 1회만.
  const recordView = useCallback(() => {
    if (typeof window === "undefined") return;
    const seenKey = `pibutenten:view:${card.id}`;
    if (ssGet(seenKey)) return; // 이미 카운팅한 세션 (safe-storage — R2-3)
    ssSet(seenKey, "1");

    let sessionId = ssGet(SID_KEY);
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      ssSet(SID_KEY, sessionId);
    }

    // optimistic UI update — 카드 조회수 표시 즉시 +1 (trigger가 DB도 +1)
    setViewCount((v) => (typeof v === "number" ? v + 1 : 1));

    // 비로그인 흥미 점수 (no-op if 로그인). recordView 자체가 의도 신호.
    // v4 (2026-06-30): 피드/리포트 분리. 리포트(type=review_summary, 시술 리포트 앵커)는
    //   정보 밀도가 높은 핵심 콘텐츠 → +8 (리포트 2건이면 16 ≥ THRESHOLD 15 → 트리거).
    //   일반 피드 카드(Q&A·후기 등)는 +2. seenKey dedup 가 세션당 카드 1회만 가산 보장.
    //   식별자는 cards.type(=review_summary) — procedure-report.ts 가 앵커를 type 으로 조회·생성
    //   (category 컬럼은 풀 카드에 미세팅이라 그쪽으로 분기하면 항상 false → 전부 +2 로 잘못 가산).
    addEngagement(card.type === "review_summary" ? "report-view" : "card-view");

    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await sb.auth.getUser();
        // active identity 분리 집계 — 같은 묶음 내 ID 전환 시 별도 profile_id로 카운트.
        // ADR 0014 Phase 2 (마이그 0186): card_views.user_id → profile_id RENAME.
        const activeId = getActiveIdentityId();
        const profileId = user ? (activeId ?? user.id) : null;
        await sb.from("card_views").insert({
          card_id: card.id,
          profile_id: profileId,
          session_id: sessionId,
        });
        onViewedRef.current?.();
      } catch (e) {
        // 트래킹 실패는 UX에 영향 X — silent fail 이지만 운영 가시성 위해 콘솔 로그
        console.error("[card_views] insert failed:", e);
      }
    })();
  }, [card.id, card.type]);

  // ── 4) 단독 페이지 진입 시 즉시 view 카운트 ──
  //
  // 2026-05-20 정책 정비: 옛 dwell observer (4~10초 viewport 체류) 제거.
  //   배경:
  //     - SNS 표준(인스타·트위터)은 view = 명백한 의도 신호. 시간 윈도우는 비표준.
  //     - 옛 정책: 4초 미만 = 스쳐감 X, 10초 초과 = 딴짓 X, 첫 화면 = scroll 안 함 X.
  //       → 좋아요/저장/공유한 사용자도 view 카운트 누락되는 사례가 빈번.
  //   새 정책: view = 명백한 의도 신호 모음.
  //     1) 단독 페이지 진입 (forceExpanded=true) — 본 effect 가 처리
  //     2) 카드 펼침 (더보기 클릭)                  — Card.tsx onClick → recordView()
  //     3) 영상 보러가기 클릭                       — CardMedia onWatchClick → recordView()
  //     4) 좋아요 / 저장 / 공유 토글 성공            — useCardEngagement 내부에서 recordView()
  //     5) 댓글 작성 성공                          — CommentsBlock submit 성공 → recordView()
  //   session dedup 은 recordView 내부 sessionStorage 가드(`pibutenten:view:${id}`)가
  //   같은 세션 같은 카드 중복 INSERT 차단. 즉 한 사람이 좋아요+공유 모두 해도 view 1회.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forceExpanded) {
      recordView();
    }
  }, [forceExpanded, recordView]);

  return { me, viewCount, recordView };
}

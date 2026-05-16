"use client";

/**
 * Viewer (보는 사람) 컨텍스트 통합 훅 (Phase 4-4).
 *
 * 책임:
 *  1) me 결정 (3-state) — active profile.id + role 단일 기준
 *     - 비로그인 → me = null
 *     - 로딩 중 → me = undefined (race 차단용)
 *     - 로그인 → me = { id, role }, 본인 묶음 검증 포함
 *  2) viewCount 카운터 (낙관적 +1)
 *  3) impression — mount 시 1회 enqueue (session dedup)
 *  4) recordView — 의도 신호 발생 시 호출 (session_id 기반 dedup, DB 트리거가 view_count 갱신)
 *  5) dwell observer — 4-10초 viewport 체류 시 자동 recordView
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
  const [me, setMe] = useState<ViewerMe>(undefined);
  const [viewCount, setViewCount] = useState(card.view_count);

  // onViewed가 매 렌더마다 새 함수여도 effect 의존성에 안 걸리도록 ref로 고정
  const onViewedRef = useRef(onViewed);
  useEffect(() => {
    onViewedRef.current = onViewed;
  }, [onViewed]);

  // ── 1) me 결정 ──
  // active profile.id 단일 조회 + 본인 묶음 검증.
  // (Phase 9 정책 — 묶음 최고 권한 X, active profile 자체 role만)
  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!alive) return;
      if (!user) {
        setMe(null);
        return;
      }
      const activeId = getActiveIdentityId() ?? user.id;
      const { data: prof } = await sb
        .from("profiles")
        .select("id, role, auth_user_id")
        .eq("id", activeId)
        .maybeSingle();
      if (!alive) return;
      const row = prof as
        | { id: string; role: string; auth_user_id: string }
        | null;
      // 본인 묶음 검증 — 다른 사람 profile cookie 위조 차단
      const isMine =
        !!row && (row.id === user.id || row.auth_user_id === user.id);
      if (!isMine) {
        setMe({ id: user.id, role: "user" });
        return;
      }
      const role = ((row?.role as string) ?? "user") as
        | "admin"
        | "doctor"
        | "user";
      setMe({ id: activeId, role });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── 2) impression — mount 1회 enqueue ──
  // 노출(impression) +1 — 큐에 enqueue (session 1회 dedup은 sessionStorage로 차단).
  // 조회(view)와 분리: 노출 = 단순 등장, 조회 = 의도 신호.
  // engagement rate = view_count / impression_count 로 인기도 평가 가능.
  // DB trigger가 cards.impression_count 자동 +1. 큐가 800ms 디바운스 모음 INSERT.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forceExpanded) return; // 단독 페이지는 피드 노출과 무관
    const impKey = `pibutenten:imp:${card.id}`;
    if (sessionStorage.getItem(impKey)) return;
    sessionStorage.setItem(impKey, "1");
    enqueueImpression(card.id);
  }, [card.id, forceExpanded]);

  // ── 3) recordView ──
  // card_views.insert만 호출. DB trigger가 cards.view_count도 자동 +1 동기화.
  // session_id 기반 dedup — 같은 세션 같은 card는 1회만.
  const recordView = useCallback(() => {
    if (typeof window === "undefined") return;
    const seenKey = `pibutenten:view:${card.id}`;
    if (sessionStorage.getItem(seenKey)) return; // 이미 카운팅한 세션
    sessionStorage.setItem(seenKey, "1");

    let sessionId = sessionStorage.getItem(SID_KEY);
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SID_KEY, sessionId);
    }

    // optimistic UI update — 카드 조회수 표시 즉시 +1 (trigger가 DB도 +1)
    setViewCount((v) => (typeof v === "number" ? v + 1 : 1));

    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await sb.auth.getUser();
        // active identity 분리 집계 — 같은 묶음 내 ID 전환 시 별도 user_id로 카운트
        const activeId = getActiveIdentityId();
        const userId = user ? (activeId ?? user.id) : null;
        await sb.from("card_views").insert({
          card_id: card.id,
          user_id: userId,
          session_id: sessionId,
        });
        onViewedRef.current?.();
      } catch (e) {
        // 트래킹 실패는 UX에 영향 X — silent fail 이지만 운영 가시성 위해 콘솔 로그
        console.error("[card_views] insert failed:", e);
      }
    })();
  }, [card.id]);

  // ── 4) dwell observer — 4-10초 viewport 체류 시 자동 view ──
  //
  // 카드가 viewport 이탈할 때 머문 시간 측정:
  //   · 4초 미만: 스쳐 지나감 → X
  //   · 4초 ≤ dwell ≤ 10초: 실제 읽음 → 카운팅 ✅
  //   · 10초 초과: 자리비움(딴짓 의심) → X
  //
  // 첫 화면 스크롤 없이 등장한 카드는 dwell 시작 자체를 안 함 → 카운팅 X.
  //
  // 명시적 트리거 (dwell 윈도우와 무관하게 즉시 카운팅):
  //   1. 단독 페이지 진입 (forceExpanded=true)
  //   2. 카드 펼침 (더보기 클릭)
  //   3. 영상 보러가기 클릭
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forceExpanded) {
      recordView();
      return;
    }
    const el = cardRef.current;
    if (!el) return;

    let scrolled = false;
    let dwellStartTime: number | null = null;

    function onScroll() {
      if (scrolled) return;
      scrolled = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          // 카드 진입 — dwell 타이머 시작 (단, 페이지 스크롤 발생 후에만)
          if (scrolled) dwellStartTime = Date.now();
        } else {
          // 카드 이탈 — dwell 시간 측정 + 윈도우 검사
          if (dwellStartTime !== null) {
            const dwellMs = Date.now() - dwellStartTime;
            dwellStartTime = null;
            if (dwellMs >= DWELL_MIN_MS && dwellMs <= DWELL_MAX_MS) {
              recordView();
              observer.disconnect();
            }
            // 4초 미만(스쳐감) or 10초 초과(딴짓) → 무시
          }
        }
      },
      {
        rootMargin: "-35% 0px -35% 0px",
        threshold: 0.01,
      },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [card.id, forceExpanded, recordView, cardRef]);

  return { me, viewCount, recordView };
}

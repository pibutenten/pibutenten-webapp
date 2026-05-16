"use client";

/**
 * 카드의 좋아요 / 저장 / 공유 — 통합 인터랙션 훅 (Phase 4-3).
 *
 * Card.tsx 곳곳에 산재해 있던:
 *  - 5개 useState (liked, likePending, saved, savePending + 3개 카운터)
 *  - viewer 상태 prefetch useEffect (~40줄)
 *  - handleLike / handleSave / inline share 핸들러 (~150줄)
 * 을 단일 훅으로 통합.
 *
 * me 상태 (3-state):
 *  - undefined = 로딩 중 → 클릭 silent ignore (race 차단)
 *  - null      = 비로그인 → onLoginRequired 호출 (LoginPromptDialog 트리거)
 *  - object    = 로그인 → 정상 처리
 *
 * 외부 인터페이스:
 *   const eng = useCardEngagement(card, { liked, saved }, me, setAuthPrompt);
 *   eng.like.active / count / pending / toggle()
 *   eng.save.active / count / pending / toggle()
 *   eng.share.count / share()
 */
import { useCallback, useEffect, useState } from "react";
import type { CardData } from "@/components/Card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";

export type EngagementMe =
  | { id: string; role: "admin" | "doctor" | "user" }
  | null
  | undefined;

export type ViewerPrefetch = {
  liked?: boolean;
  saved?: boolean;
};

export type CardEngagement = {
  like: {
    active: boolean;
    count: number;
    pending: boolean;
    toggle: () => void;
  };
  save: {
    active: boolean;
    count: number;
    pending: boolean;
    toggle: () => void;
  };
  share: {
    count: number;
    /** 공유 완료 시 채널 반환 — 카운트 갱신은 훅 내부 자동 처리. */
    share: () => Promise<void>;
  };
};

/** localStorage 안전 접근 (인앱 브라우저 sandbox 방어) */
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* ignore — Google/카톡 인앱 sandbox */
  }
}
function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useCardEngagement(
  card: CardData,
  viewer: ViewerPrefetch,
  me: EngagementMe,
  onLoginRequired: (reason: string) => void,
  /** 공유 실제 동작 함수 — 호출처가 shareCard()를 그대로 전달.
   *  hook 내부에서 직접 import 시 순환 의존 위험 회피. */
  shareCard: (
    card: CardData,
  ) => Promise<"native" | "link-copy" | null>,
): CardEngagement {
  // ── State ──
  const [likeCount, setLikeCount] = useState(card.like_count);
  const [liked, setLiked] = useState(viewer.liked ?? false);
  const [likePending, setLikePending] = useState(false);
  const [saved, setSaved] = useState(viewer.saved ?? false);
  const [saveCount, setSaveCount] = useState(card.save_count ?? 0);
  const [savePending, setSavePending] = useState(false);
  const [shareCount, setShareCount] = useState(card.share_count ?? 0);

  // ── 초기 viewer 상태 fetch ──
  // server prefetch가 있으면 client fetch 생략.
  // 미로그인 사용자만 localStorage에서 좋아요 기억 복원.
  const hasViewerPrefetch =
    viewer.liked !== undefined || viewer.saved !== undefined;
  useEffect(() => {
    if (hasViewerPrefetch) return; // 서버에서 이미 받음 → fetch 생략
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // 정책 (2026-05-15 재정의): 활동(좋아요/저장) 표시는 **active profile.id 단일** 기준.
        // 묶음의 다른 profile 로 누른 좋아요는 그 profile 의 활동 — 본인이라도 active 가 다르면 OFF.
        // active = cookie 'pibutenten:identity' = 'primary' 면 user.id, UUID 면 그 값.
        const activeId = getActiveIdentityId() ?? user.id;

        const [likeRes, saveRes] = await Promise.all([
          supabase
            .from("card_likes")
            .select("card_id")
            .eq("card_id", card.id)
            .eq("user_id", activeId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from("card_saves")
            .select("card_id")
            .eq("card_id", card.id)
            .eq("user_id", activeId)
            .limit(1)
            .maybeSingle(),
        ]);
        if (!alive) return;
        setLiked(!!likeRes.data);
        setSaved(!!saveRes.data);
      } else {
        if (alive) setLiked(lsGet(`card-liked-${card.id}`) === "1");
      }
    })();
    return () => {
      alive = false;
    };
  }, [card.id, hasViewerPrefetch]);

  // ── 좋아요 토글 ──
  const toggleLike = useCallback(() => {
    if (typeof window === "undefined") return;
    if (me === undefined) return; // 로딩 중 — race 차단
    if (me === null) {
      onLoginRequired("좋아요를 누르려면 회원가입이 필요해요");
      return;
    }
    if (likePending) return; // 연타 가드
    setLikePending(true);
    const supabase = createSupabaseBrowserClient();
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));

    (async () => {
      try {
        const { data, error } = await supabase.rpc("toggle_card_like", {
          p_card_id: card.id,
          p_identity_id: getActiveIdentityId(),
        });
        if (error) throw error;
        const row = (
          data as { liked: boolean; like_count: number }[] | null
        )?.[0];
        if (row) {
          setLiked(row.liked);
          setLikeCount(row.like_count);
          if (row.liked) lsSet(`card-liked-${card.id}`, "1");
          else lsRemove(`card-liked-${card.id}`);
        }
      } catch (e) {
        // RPC 실패 — UI 롤백 + 콘솔 로깅 (silent fail 방지)
        console.error("[useCardEngagement] toggle_card_like failed:", e);
        setLiked(wasLiked);
        setLikeCount((c) => (wasLiked ? c + 1 : Math.max(0, c - 1)));
      } finally {
        setLikePending(false);
      }
    })();
  }, [card.id, liked, likePending, me, onLoginRequired]);

  // ── 저장 토글 ──
  // ⚠️ 모든 경로에서 setSavePending(false)로 풀어야 다음 클릭이 막히지 않음.
  const toggleSave = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (me === undefined) return;
    if (me === null) {
      onLoginRequired("저장하려면 회원가입이 필요해요");
      return;
    }
    if (savePending) return;
    setSavePending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const wasSaved = saved;
      // 낙관적
      setSaved(!wasSaved);
      setSaveCount((c) => (wasSaved ? Math.max(0, c - 1) : c + 1));
      // v5.1+ identity 기반 RPC (PK=(identity_id, card_id))
      const activeIdentityId = getActiveIdentityId();
      const { data, error } = await supabase.rpc("toggle_card_save", {
        p_card_id: card.id,
        p_identity_id: activeIdentityId,
      });
      if (error) {
        console.error("[useCardEngagement] toggle_card_save:", error);
        alert((wasSaved ? "저장 취소" : "저장") + " 실패: " + error.message);
        // 낙관적 복원
        setSaved(wasSaved);
        setSaveCount((c) => (wasSaved ? c + 1 : Math.max(0, c - 1)));
        return;
      }
      const row = (
        data as { saved: boolean; save_count: number }[] | null
      )?.[0];
      if (row) {
        setSaved(row.saved);
        setSaveCount(row.save_count);
      }
      // 트리거가 갱신한 정확한 save_count 재조회
      const { data: q } = await supabase
        .from("cards")
        .select("save_count")
        .eq("id", card.id)
        .maybeSingle();
      if (q)
        setSaveCount(
          Number((q as { save_count: number }).save_count ?? 0),
        );
    } finally {
      // 어떤 경로로 끝나든 무조건 pending 해제 — 다음 클릭 가능
      setSavePending(false);
    }
  }, [card.id, saved, savePending, me, onLoginRequired]);

  // ── 공유 ──
  // 사용자 취소 시 카운트 X. card_shares INSERT 트리거(0095)가 share_count 자동 갱신.
  const doShare = useCallback(async () => {
    const channel = await shareCard(card);
    if (!channel) return;
    const supabase = createSupabaseBrowserClient();
    const { data: u } = await supabase.auth.getUser();
    const activeId = getActiveIdentityId();
    const userId = u.user ? (activeId ?? u.user.id) : null;
    const prevCount = shareCount;
    setShareCount((c) => c + 1);
    const insRes = await supabase.from("card_shares").insert({
      card_id: card.id,
      user_id: userId,
      channel,
    });
    if (insRes.error) {
      setShareCount(prevCount);
      return;
    }
    // 트리거가 갱신한 정확한 카운트 재조회
    const { data: q } = await supabase
      .from("cards")
      .select("share_count")
      .eq("id", card.id)
      .maybeSingle();
    if (q)
      setShareCount(
        Number((q as { share_count: number }).share_count ?? prevCount + 1),
      );
  }, [card, shareCount, shareCard]);

  return {
    like: { active: liked, count: likeCount, pending: likePending, toggle: toggleLike },
    save: { active: saved, count: saveCount, pending: savePending, toggle: toggleSave },
    share: { count: shareCount, share: doShare },
  };
}

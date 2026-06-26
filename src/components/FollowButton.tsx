"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { useSession } from "@/lib/session-context";
import { showToast } from "@/lib/toast";

/**
 * FollowButton — 회원/원장 프로필 팔로우 토글 (2026-06-27).
 *
 * 명함(profile.id) 단위. active 명함이 followeeId 를 팔로우/언팔로우.
 *   - 초기 상태: get_my_follow RPC (비로그인은 following=false).
 *   - 토글: toggle_follow RPC (낙관적 업데이트 + 실패 롤백). active 명함=getActiveIdentityId().
 *   - 본인(active==followee) 또는 followeeId 없음이면 렌더 안 함.
 *   - 팔로우 시 그 대상의 새 발행 글이 알림함에 뜸(마이그 0290 트리거).
 */
export default function FollowButton({
  followeeId,
  className,
  size = "md",
}: {
  followeeId: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const session = useSession();
  const myId = session?.activeIdentityId ?? null;
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!followeeId) return;
    let alive = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb.rpc("get_my_follow", { p_followee_id: followeeId });
      if (!alive) return;
      const row = (data as { following: boolean; follower_count: number }[] | null)?.[0];
      setFollowing(row ? !!row.following : false);
    })();
    return () => {
      alive = false;
    };
  }, [followeeId]);

  // 본인 명함이거나 대상 없음 → 버튼 숨김.
  if (!followeeId || (myId && myId === followeeId)) return null;

  const toggle = async () => {
    if (!myId) {
      showToast("팔로우하려면 로그인이 필요해요", { tone: "danger" });
      return;
    }
    if (pending || following === null) return;
    setPending(true);
    const was = following;
    setFollowing(!was);
    try {
      const { data, error } = await createSupabaseBrowserClient().rpc("toggle_follow", {
        p_followee_id: followeeId,
        p_identity_id: getActiveIdentityId(),
      });
      if (error) throw error;
      const row = (data as { following: boolean; follower_count: number }[] | null)?.[0];
      if (row) setFollowing(!!row.following);
      showToast(was ? "팔로우를 취소했어요" : "팔로우했어요");
    } catch {
      setFollowing(was);
      showToast("잠시 후 다시 시도해 주세요", { tone: "danger" });
    } finally {
      setPending(false);
    }
  };

  const isFollowing = !!following;
  const pad = size === "sm" ? "5px 12px" : "7px 16px";
  const font = size === "sm" ? 13 : 14;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void toggle();
      }}
      disabled={pending || following === null}
      aria-pressed={isFollowing}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: pad,
        borderRadius: 999,
        fontSize: font,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
        border: isFollowing ? "1px solid var(--border)" : "1px solid var(--primary)",
        background: isFollowing ? "var(--white)" : "var(--primary)",
        color: isFollowing ? "var(--text-secondary)" : "#fff",
        opacity: following === null ? 0.6 : 1,
        transition: "background 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {isFollowing ? "팔로잉" : "팔로우"}
    </button>
  );
}

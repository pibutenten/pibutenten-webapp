"use client";

/**
 * CommentItem — 댓글 1개 (2026-05-28 분리).
 *
 * 옛: CommentsBlock.tsx 안 inline 함수 (L346~710).
 * 현재: 자기충족 컴포넌트. 동작 변경 0.
 *
 * 책임:
 *   - 닉네임·시간·답글·좋아요·메뉴(⋮) 헤더 라인 inline 렌더
 *   - 좋아요 토글 (toggle_comment_like RPC, 낙관적 업데이트 + 실패 시 revert)
 *   - 메뉴 panel (Portal, 외부 클릭 시 닫힘)
 *   - 수정 모드 (textarea + 저장/취소)
 *   - 가림/삭제 상태 시각화 (회색 dim)
 *   - 의사 verified ✓ 아이콘
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { ROLES } from "@/lib/identity-shared";
import RelativeTime from "@/components/RelativeTime";
import type {
  CommentRow,
  CommentStatus,
  CommentViewer,
} from "@/lib/types/comment";

type Props = {
  comment: CommentRow;
  me: CommentViewer;
  isAdmin: boolean;
  isReply?: boolean;
  isReplying?: boolean;
  onReplyClick?: () => void;
  onPatch: (id: number, p: { body?: string; status?: CommentStatus }) => Promise<boolean>;
  onDelete: (id: number) => void;
  /** 비로그인 사용자가 좋아요 시도 시 호출 — 부모(CommentsBlock)의 LoginPromptDialog 열림. */
  onRequireLogin: () => void;
};

export default function CommentItem({
  comment,
  me,
  isAdmin,
  isReply = false,
  isReplying = false,
  onReplyClick,
  onPatch,
  onDelete,
  onRequireLogin,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  // v4 — 좋아요 (root + 답글 모두)
  const [liked, setLiked] = useState<boolean>(!!comment.viewer_liked);
  const [likeCount, setLikeCount] = useState<number>(comment.like_count);
  const [likePending, setLikePending] = useState(false);
  async function toggleLike() {
    if (likePending) return;
    if (!me) {
      onRequireLogin();
      return;
    }
    setLikePending(true);
    const wasLiked = liked;
    setLiked(!wasLiked); // 낙관적
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb.rpc("toggle_comment_like", {
      p_comment_id: comment.id,
      p_identity_id: getActiveIdentityId(),
    });
    if (error) {
      setLiked(wasLiked);
      setLikeCount(comment.like_count);
    } else {
      const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
      if (row) {
        setLiked(row.liked);
        setLikeCount(row.like_count);
      }
    }
    setLikePending(false);
  }
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 시 메뉴 닫기 (trigger·panel 둘 다 검사) + Escape 키 닫기 (A11y, 2026-05-28).
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuTriggerRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
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

  // 메뉴 위치 계산 — trigger 버튼 기준 viewport 좌표 (portal로 body에 렌더되므로)
  function openMenu() {
    const el = menuTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - 120, // min-w 120px 기준 우측 정렬
    });
    setMenuOpen(true);
  }

  const isAuthor = !!me && comment.author_id === me.id;
  // 가림/복원/삭제는 관리자 또는 본인. (해당 글 doctor 권한은 RLS가 강제 — UI에서 버튼은 관리자/원장 본인 매칭일 때만 노출하기 위해
  //  me.doctor_id 와 매칭 시 표시하는데, 클라이언트는 qa의 doctor_id를 모르므로 관리자에게만 노출. 원장은 어차피 RLS로 가능.)
  const canModerate = isAdmin;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;
  const showMenu = canEdit || canDelete || canModerate;

  const isHidden = comment.status === "hidden";
  const isDeleted = comment.status === "deleted";

  // 가림 댓글 표시: 본인 / admin / doctor RLS 통과로 응답에 포함된 경우만. 회색 처리.
  const dimmed = isHidden || isDeleted;

  // 작성자 배지 — role='doctor' active identity면 verified 마크
  const role = comment.author?.role;
  const isAuthorDoctor = role === ROLES.DOCTOR;

  const displayName = comment.author?.display_name ?? "익명";
  const profileLink = comment.author?.handle
    ? `/${comment.author.handle}`
    : comment.author?.id
      ? `/u/${comment.author.id}`
      : null;
  // P1-4 fix — RelativeTime 컴포넌트로 위임. SSR 빈 문자열 → 마운트 후 실제 값 set.
  //   hydration mismatch (React #418) 방지.

  return (
    <div
      className={
        dimmed ? "rounded-md px-2 py-1.5" : "rounded-md px-0 py-1"
      }
      style={
        dimmed
          ? { backgroundColor: "#EEEEEE", color: "#888" }
          : undefined
      }
    >
      {/* 새 레이아웃: 메타(시간·답글·♡·⋮)는 우측 float, 닉네임+본문은 inline 텍스트로 흐름.
          본문이 길어지면 자연 wrap 으로 둘째 줄이 닉네임과 동일한 좌측 라인에서 시작.
          닉네임 ↔ 본문 5px / 메타 사이 간격 2px·5px·2px·8px. */}
      <div className="text-[13px] leading-[1.5]" style={{ display: "flow-root" }}>
        {/* 메타 — float-right. 텍스트 흐름이 좌측부터 채워지고 끝나면 둘째 줄은 좌단으로 wrap. */}
        <div className="float-right ml-2 inline-flex items-center whitespace-nowrap">
          <span className="text-[11px] text-[var(--text-muted)]">
            <RelativeTime iso={comment.created_at} />
          </span>
          {isHidden && (
            <span className="ml-1 text-[11px] text-[var(--text-muted)]">숨김됨</span>
          )}
          {isDeleted && (
            <span className="ml-1 text-[11px] text-[var(--text-muted)]">🗑 삭제</span>
          )}
          {/* 답글 — root 댓글에만 (시간 → 가온점: 2px, 가온점 → 답글: 5px) */}
          {!isReply && onReplyClick && !isDeleted && (
            <>
              <span
                style={{ marginLeft: "2px" }}
                className="inline-flex items-center text-[11px] leading-none text-[var(--text-muted)]"
                aria-hidden
              >
                ·
              </span>
              <button
                type="button"
                onClick={onReplyClick}
                style={{ marginLeft: "5px" }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
              >
                {isReplying ? "답글 취소" : "답글"}
              </button>
            </>
          )}
          {/* 좋아요 — 답글 → ♡: 2px */}
          {!isDeleted && (
            <button
              type="button"
              onClick={toggleLike}
              disabled={likePending}
              aria-label={liked ? "좋아요 취소" : "좋아요"}
              style={{ marginLeft: "2px" }}
              className={
                "inline-flex items-center gap-0.5 text-[11px] transition-colors " +
                (liked
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--accent)]")
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[12px] w-[12px]"
                aria-hidden
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
          )}

          {showMenu && (
            <button
              ref={menuTriggerRef}
              type="button"
              aria-label="메뉴"
              style={{ marginLeft: "8px" }}
              className="px-1 text-[16px] leading-none text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={(e) => {
                e.stopPropagation();
                if (menuOpen) setMenuOpen(false);
                else openMenu();
              }}
            >
              ⋮
            </button>
          )}
        </div>

        {/* 닉네임 */}
        {profileLink ? (
          <Link
            href={profileLink}
            className="font-bold text-[var(--text)] hover:text-[var(--primary)] hover:underline"
            style={dimmed ? { color: "#888" } : undefined}
          >
            {displayName}
          </Link>
        ) : (
          <span
            className="font-bold text-[var(--text)]"
            style={dimmed ? { color: "#888" } : undefined}
          >
            {displayName}
          </span>
        )}
        {/* 원장님 verified ✓ */}
        {isAuthorDoctor && (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            className="ml-0.5 inline-block h-[12px] w-[12px] align-middle"
            aria-label="피부과 전문의"
          >
            <path
              d="M6 0L7.6025 1.30939L9.7082 1.1459L10.1954 3.10104L12 4.1459L11.1858 6L12 7.8541L10.1954 8.89896L9.7082 10.8541L7.6025 10.6906L6 12L4.3975 10.6906L2.2918 10.8541L1.80459 8.89896L0 7.8541L0.814188 6L0 4.1459L1.80459 3.10104L2.2918 1.1459L4.3975 1.30939L6 0Z"
              fill="#4CBFF2"
            />
            <path
              d="M8.56567 4.79451L5.50235 7.85783L3.43457 5.79005L4.08693 5.1373L5.50235 6.55232L7.91292 4.14215L8.56567 4.79451Z"
              fill="#FFFFFF"
            />
          </svg>
        )}
        {/* 본문 — 닉네임 ↔ 본문 5px. 둘째 줄부터 좌측 0 에서 시작 (들여쓰기 없음). */}
        {!editing && (
          <span
            style={{ marginLeft: "5px" }}
            className="text-[13px] text-[var(--text-secondary)]"
          >
            {isDeleted
              ? "(삭제된 댓글이에요)"
              : isHidden && !canModerate && !isAuthor
                ? "(비공개 처리된 댓글입니다)"
                : comment.body.replace(/\s+/g, " ").trim()}
          </span>
        )}

      </div>

      {/* 메뉴 panel — Portal (트리거 버튼은 위 float-right div 안에 있음) */}
      {showMenu && menuOpen && menuPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuPanelRef}
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
            }}
            className="z-[200] min-w-[120px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {canEdit && !isDeleted && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--bg-soft)]"
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment.body);
                  setMenuOpen(false);
                }}
              >
                수정
              </button>
            )}
            {canModerate && comment.status === "visible" && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--bg-soft)]"
                onClick={async () => {
                  setMenuOpen(false);
                  await onPatch(comment.id, { status: "hidden" });
                }}
              >
                숨김
              </button>
            )}
            {canModerate && isHidden && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--bg-soft)]"
                onClick={async () => {
                  setMenuOpen(false);
                  await onPatch(comment.id, { status: "visible" });
                }}
              >
                해제
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(comment.id);
                }}
              >
                삭제
              </button>
            )}
          </div>,
          document.body,
        )}

      {/* 본문 / 수정 폼 */}
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <textarea
            value={editBody}
            onChange={(e) => {
              setEditBody(e.target.value);
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            rows={2}
            className="w-full resize-none overflow-hidden rounded border border-[var(--border)] p-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-2.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => setEditing(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="rounded bg-[var(--primary)] px-3 py-1 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              disabled={!editBody.trim()}
              onClick={async () => {
                const ok = await onPatch(comment.id, { body: editBody.trim() });
                if (ok) setEditing(false);
              }}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {/* 답글 버튼은 헤더 라인 inline으로 옮김 */}
    </div>
  );
}

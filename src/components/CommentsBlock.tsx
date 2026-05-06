"use client";

/**
 * CommentsBlock — Q&A 카드 하단의 댓글/답글 영역.
 *
 * - 미리보기 모드: 최신 root 댓글 2개만 표시
 * - 펼친 모드: 전체 root + 각 답글
 * - 작성자 본인 / 해당 글 원장님 / 관리자에게는 가림(hidden) 댓글도 회색으로 표시
 * - 1단계 답글까지만 (답글에는 [답글] 버튼 없음)
 *
 * RLS가 권한을 강제하므로 UI는 표시 여부와 액션 버튼 노출만 담당.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CommentStatus = "visible" | "hidden" | "deleted";

type Author = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
};

type CommentRow = {
  id: number;
  qa_id: number;
  author_id: string | null;
  parent_id: number | null;
  body: string;
  status: CommentStatus;
  like_count: number;
  created_at: string;
  updated_at: string;
  author: Author | null;
};

type CommentWithReplies = CommentRow & { replies: CommentRow[] };

type Props = {
  qaId: number;
  /** 글이 속한 원장님 slug (현재 로그인한 사람이 그 doctor 본인일 때 [원장님] 배지) */
  doctorSlug: string | null;
  /** 발행되지 않은 글이면 댓글 폼 숨김 */
  isPublishedQa: boolean;
  /** 댓글 수 변경 알림 (부모 카드의 카운트 갱신용) */
  onCountChange?: (next: number) => void;
  /** 입력 폼 표시 여부 — 부모가 펼침 상태 기준으로 결정 */
  showInput?: boolean;
};

type Me = {
  id: string;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
} | null;

export default function CommentsBlock({
  qaId,
  isPublishedQa,
  onCountChange,
  showInput = false,
}: Props) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [totalRoot, setTotalRoot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<number | null>(null);

  // ── 댓글 fetch
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/comments?qaId=${qaId}&limit=50`, {
        cache: "no-store",
      });
      const j = (await r.json()) as
        | { comments: CommentWithReplies[]; total_root: number }
        | { error: string };
      if ("error" in j) {
        setError(j.error);
        setComments([]);
        setTotalRoot(0);
      } else {
        setComments(j.comments);
        setTotalRoot(j.total_root);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [qaId]);

  // ── 현재 로그인 사용자 정보 (id/role/doctor_id)
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
        setMeLoaded(true);
        return;
      }
      // 본인 프로필 + 본인 doctor_id (RLS상 본인은 select 가능)
      const [{ data: prof }, { data: docMap }] = await Promise.all([
        sb.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
        sb.from("doctor_accounts").select("doctor_id").eq("profile_id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      setMe({
        id: user.id,
        role: (prof?.role as Me extends infer T ? (T extends { role: infer R } ? R : never) : never) ?? "user",
        doctor_id: (docMap?.doctor_id as string | undefined) ?? null,
      });
      setMeLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isLoggedIn = !!me;
  const isAdmin = me?.role === "admin";
  // qa의 doctor 본인 여부는 댓글의 권한과는 별개 (서버 RLS가 진실원). UI는 me.doctor_id로 표시 보조.

  // ── 표시할 댓글 (preview / expanded 토글)
  const visibleRoots = expanded ? comments : comments.slice(0, 3);

  // ── 가시 댓글 총 수 (전체 표시용 카운트는 totalRoot + 답글 합산보다는 visible만 카운트)
  const visibleCount = useMemo(() => {
    let c = 0;
    for (const r of comments) {
      if (r.status === "visible") c += 1;
      for (const rep of r.replies) {
        if (rep.status === "visible") c += 1;
      }
    }
    return c;
  }, [comments]);

  // ── 부모(QACard)에 댓글 수 변경 알림
  useEffect(() => {
    onCountChange?.(visibleCount);
  }, [visibleCount, onCountChange]);

  // ── 작성/답글 제출
  async function submitComment(parentId: number | null) {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qaId, parentId, body }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        alert(j.error ?? "댓글 작성 실패");
        return;
      }
      setBody("");
      setReplyTarget(null);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function patchComment(
    id: number,
    patch: { body?: string; status?: CommentStatus },
  ) {
    const r = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      alert(j.error ?? "수정 실패");
      return false;
    }
    await reload();
    return true;
  }

  async function deleteComment(id: number) {
    if (!confirm("정말 삭제할까요? 답글도 함께 삭제됩니다.")) return;
    const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      alert(j.error ?? "삭제 실패");
      return;
    }
    await reload();
  }

  // 미니멀 모드: 댓글 0개 + 입력 폼 비표시 → 자체 렌더링 안 함
  const hasComments = visibleCount > 0;
  if (!loading && !hasComments && !showInput) {
    return null;
  }

  return (
    <div
      className="mt-3 border-t border-[var(--border)] pt-2.5 text-[13px] text-[var(--text)]"
      onClick={(e) => e.stopPropagation()}
    >
      {totalRoot > 3 && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            {expanded ? "접기" : `모두 보기 (${totalRoot})`}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-red-600">댓글을 불러오지 못했어요: {error}</p>
      )}

      <ul className="flex flex-col">
        {visibleRoots.map((c) => (
          <li key={c.id}>
            <CommentItem
              comment={c}
              me={me}
              isAdmin={isAdmin}
              onReplyClick={() =>
                setReplyTarget((v) => (v === c.id ? null : c.id))
              }
              isReplying={replyTarget === c.id}
              onPatch={patchComment}
              onDelete={deleteComment}
            />

            {/* 답글 목록 */}
            {c.replies.length > 0 && (
              <ul className="flex flex-col pl-4">
                {c.replies.map((rep) => (
                  <li key={rep.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-0.5 top-2 select-none text-[12px] text-[var(--text-muted)]"
                    >
                      ↳
                    </span>
                    <div className="pl-4">
                      <CommentItem
                        comment={rep}
                        me={me}
                        isAdmin={isAdmin}
                        isReply
                        onPatch={patchComment}
                        onDelete={deleteComment}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* 답글 입력 폼 (root 댓글에만) */}
            {replyTarget === c.id && isLoggedIn && (
              <div className="mt-2 pl-4">
                <CommentForm
                  body={body}
                  onChange={setBody}
                  onSubmit={() => submitComment(c.id)}
                  submitting={submitting}
                  placeholder="답글을 입력하세요"
                  onCancel={() => {
                    setReplyTarget(null);
                    setBody("");
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* root 댓글 입력 폼 — showInput 시에만 노출, meLoaded 후에만 분기 (깜빡임 방지) */}
      {showInput && isPublishedQa && meLoaded && isLoggedIn && replyTarget == null && (
        <div className="mt-3">
          <CommentForm
            body={body}
            onChange={setBody}
            onSubmit={() => submitComment(null)}
            submitting={submitting}
            placeholder="댓글 남기기"
          />
        </div>
      )}
      {showInput && isPublishedQa && meLoaded && !isLoggedIn && (
        <div className="mt-3 text-center">
          <Link
            href="/login"
            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--primary)] hover:underline"
          >
            로그인하고 댓글 남기기
          </Link>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CommentItem — 댓글 1개
// ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  me,
  isAdmin,
  isReply = false,
  isReplying = false,
  onReplyClick,
  onPatch,
  onDelete,
}: {
  comment: CommentRow;
  me: Me;
  isAdmin: boolean;
  isReply?: boolean;
  isReplying?: boolean;
  onReplyClick?: () => void;
  onPatch: (id: number, p: { body?: string; status?: CommentStatus }) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

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

  // 작성자 배지
  const role = comment.author?.role;
  const isAuthorDoctor = role === "doctor";

  const displayName = comment.author?.display_name ?? "익명";
  const timeLabel = relativeTime(comment.created_at);

  return (
    <div
      className="rounded-md px-2 py-0.5"
      style={
        dimmed
          ? { backgroundColor: "#F5F5F5", color: "#888" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px]">
        {comment.author?.id ? (
          <Link
            href={`/u/${comment.author.id}`}
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
        {/* 원장님은 verified ✓ 만 표시 — 관리자 배지는 미니멀 위해 생략 */}
        {isAuthorDoctor && (
          <svg
            viewBox="0 0 24 24"
            fill="#5BB0D1"
            className="h-[12px] w-[12px]"
            aria-label="피부과 전문의"
          >
            <path d="M22.5 12.5l-2.7-3 .4-4-3.9-.9-2-3.5-3.7 1.9-3.7-1.9-2 3.5-3.9.8.4 4-2.7 3 2.7 3-.4 4 3.9.9 2 3.5 3.7-1.9 3.7 1.9 2-3.5 3.9-.8-.4-4 2.6-3zM10 17.5L5.5 13l1.7-1.7L10 14.1l6.7-6.7L18.4 9 10 17.5z" />
          </svg>
        )}
        {/* 본문 — editing 모드 아닐 때 한 줄로 옆에 붙임 */}
        {!editing && (
          <span
            className="whitespace-pre-wrap break-all leading-[1.5] text-[var(--text)]"
            style={dimmed ? { color: "#888" } : undefined}
          >
            {isDeleted ? "(삭제된 댓글이에요)" : comment.body}
          </span>
        )}
        <span className="text-[11px] text-[var(--text-muted)]">· {timeLabel}</span>
        {isHidden && (
          <span className="text-[11px] text-[var(--text-muted)]">🙈 가림</span>
        )}
        {isDeleted && (
          <span className="text-[11px] text-[var(--text-muted)]">🗑 삭제</span>
        )}

        {/* 답글 버튼 — 헤더 라인에 inline (root 댓글에만) */}
        {!isReply && onReplyClick && !isDeleted && (
          <button
            type="button"
            onClick={onReplyClick}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            · {isReplying ? "답글 취소" : "답글"}
          </button>
        )}

        {showMenu && (
          <div className="relative ml-auto" ref={menuRef}>
            <button
              type="button"
              aria-label="메뉴"
              className="px-1 text-[16px] leading-none text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 min-w-[120px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg">
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
                    className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--bg-soft)]"
                    onClick={async () => {
                      setMenuOpen(false);
                      await onPatch(comment.id, { status: "hidden" });
                    }}
                  >
                    가림
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
                    복원
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
              </div>
            )}
          </div>
        )}
      </div>

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

// ─────────────────────────────────────────────────────────────
// CommentForm — 입력 폼
// ─────────────────────────────────────────────────────────────

function CommentForm({
  body,
  onChange,
  onSubmit,
  submitting,
  placeholder,
}: {
  body: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  placeholder?: string;
  /** 더 이상 사용하지 않음 — 답글 취소는 헤더 라인의 [답글 취소] inline 토글로 대체 */
  onCancel?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 마운트 시 자동 포커스 — 댓글창/답글창 열림 즉시 입력 가능 (모바일 키보드 자동 활성)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // iOS Safari: 직접 focus만으론 키보드 안 뜰 수 있어 두 단계 시도
    ta.focus();
    // 다음 프레임에 한 번 더 시도 (조건부 렌더 직후 안정화 대기)
    const id = window.setTimeout(() => {
      ta.focus();
      // 커서를 끝으로
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex items-stretch gap-1.5">
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          autoFocus
          value={body}
          onChange={(e) => {
            onChange(e.target.value);
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = t.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            // Enter → 등록 / Shift+Enter → 줄바꿈
            // IME 조합 중(한글 입력)에는 isComposing/keyCode 229로 무시
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              if (!submitting && body.trim()) onSubmit();
            }
          }}
          placeholder={placeholder ?? "댓글을 입력하세요"}
          rows={1}
          maxLength={2000}
          className={
            "w-full resize-none overflow-hidden rounded-md border border-[var(--border)] px-2 py-1.5 text-[13px] focus:border-[var(--primary)] focus:outline-none " +
            (body.length >= 1500 ? "pr-14 pb-4" : "")
          }
        />
        {/* 글자수 카운트 — 1500자 이상부터만 노출 (한도 임박 알림) */}
        {body.length >= 1500 && (
          <span
            className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px]"
            style={{
              color: body.length >= 1900 ? "#E91E63" : "var(--text-muted)",
            }}
          >
            {body.length}/2000
          </span>
        )}
      </div>
      {/* 등록 — 텍스트 링크 스타일 (작고 차분) */}
      <button
        type="button"
        className="shrink-0 self-stretch rounded-md px-2.5 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)] disabled:hover:bg-transparent"
        disabled={submitting || !body.trim()}
        onClick={onSubmit}
      >
        {submitting ? "…" : "등록"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// helper: 상대시간 (예: "2일 전")
// ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  const d = new Date(iso);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

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
};

type Me = {
  id: string;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
} | null;

export default function CommentsBlock({ qaId, isPublishedQa, onCountChange }: Props) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [totalRoot, setTotalRoot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [me, setMe] = useState<Me>(null);

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

  return (
    <div
      className="mt-4 border-t border-[var(--border)] pt-3 text-[14px] text-[var(--text)]"
      onClick={(e) => e.stopPropagation()}
    >
      {totalRoot > 3 && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[12px] font-medium text-[var(--secondary)] hover:text-[var(--primary)]"
          >
            {expanded ? "접기 ▴" : `모두 보기 ▾`}
          </button>
        </div>
      )}

      {loading && (
        <p className="text-[13px] text-[var(--text-muted)]">불러오는 중…</p>
      )}
      {error && (
        <p className="text-[13px] text-red-600">댓글을 불러오지 못했어요: {error}</p>
      )}

      {!loading && !error && comments.length === 0 && (
        <p className="text-[13px] text-[var(--text-muted)]">
          첫 댓글을 남겨보세요.
        </p>
      )}

      <ul className="flex flex-col gap-3">
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
              <ul className="mt-2 flex flex-col gap-2 pl-4">
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

      {/* root 댓글 입력 폼 */}
      <div className="mt-4">
        {isLoggedIn ? (
          replyTarget == null && isPublishedQa ? (
            <CommentForm
              body={body}
              onChange={setBody}
              onSubmit={() => submitComment(null)}
              submitting={submitting}
              placeholder="댓글을 입력하세요"
            />
          ) : !isPublishedQa ? (
            <p className="text-[12px] text-[var(--text-muted)]">
              아직 발행되지 않은 글이라 댓글을 받지 않아요.
            </p>
          ) : null
        ) : (
          <p className="text-[13px] text-[var(--text-muted)]">
            <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
              로그인
            </Link>{" "}
            후 댓글을 작성할 수 있어요.
          </p>
        )}
      </div>
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
  const isAuthorAdmin = role === "admin";

  const displayName = comment.author?.display_name ?? "익명";
  const timeLabel = relativeTime(comment.created_at);

  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={
        dimmed
          ? { backgroundColor: "#F5F5F5", color: "#888" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px]">
        <span
          className="font-bold text-[var(--text)]"
          style={dimmed ? { color: "#888" } : undefined}
        >
          {displayName}
        </span>
        {isAuthorAdmin && (
          <span
            className="rounded px-1 py-0 text-[10px] font-bold"
            style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
          >
            관리자
          </span>
        )}
        {isAuthorDoctor && (
          <span
            className="rounded px-1 py-0 text-[10px] font-bold"
            style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}
          >
            원장님
          </span>
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

      {/* 답글 버튼 (root 댓글에만) */}
      {!isReply && onReplyClick && !isDeleted && (
        <div className="mt-1.5 flex items-center gap-3 text-[12px]">
          <button
            type="button"
            onClick={onReplyClick}
            className="text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            💬 {isReplying ? "답글 취소" : "답글"}
          </button>
        </div>
      )}
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
  onCancel,
}: {
  body: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  placeholder?: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={body}
        onChange={(e) => {
          onChange(e.target.value);
          const t = e.currentTarget;
          t.style.height = "auto";
          t.style.height = t.scrollHeight + "px";
        }}
        placeholder={placeholder ?? "댓글을 입력하세요"}
        rows={2}
        maxLength={2000}
        className="w-full resize-none overflow-hidden rounded-md border border-[var(--border)] p-2.5 text-[14px] focus:border-[var(--primary)] focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">{body.length}/2000</span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              className="rounded px-3 py-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={onCancel}
            >
              취소
            </button>
          )}
          <button
            type="button"
            className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
            disabled={submitting || !body.trim()}
            onClick={onSubmit}
          >
            {submitting ? "등록 중…" : "등록"}
          </button>
        </div>
      </div>
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

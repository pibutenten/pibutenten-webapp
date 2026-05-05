"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type Video = {
  youtube_id: string;
  youtube_url: string;
  topic: string | null;
  upload_date: string | null;
};

type QAStatus = "draft" | "pending_review" | "published" | "archived";

type QA = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  status: QAStatus;
  type: "qa" | "post";
  is_pick?: boolean;
  doctor_id: string | null;
  video_id: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
  doctor: Doctor | null;
  video: Video | null;
};

type Props = {
  qa: QA;
  doctorPickCount?: number;
  sameVideoQaCount?: number;
  commentCount?: number;
};

const STATUS_LABELS: Record<QAStatus, string> = {
  draft: "초안",
  pending_review: "대기",
  published: "발행",
  archived: "보관",
};

const STATUS_COLORS: Record<QAStatus, string> = {
  draft: "#9E9E9E",
  pending_review: "#FFA000",
  published: "#4CAF50",
  archived: "#616161",
};

/**
 * 원장 본인 편집기.
 * - doctor 변경 불가 (본인 doctor 고정)
 * - 모든 status 옵션 가능 (draft/pending_review/published/archived)
 * - 저장 / 발행 / 반려 / 비공개로 / 검수완료 표시 / 삭제
 *
 * 반려는 status를 'draft'로 되돌림 — 별도 알림 시스템이 없으므로
 * meta JSON에 reviewed_at 마킹만 남김 (관리자가 admin 페이지에서 확인 가능).
 */
export default function DoctorEditClient({
  qa,
  doctorPickCount = 0,
  sameVideoQaCount = 0,
  commentCount = 0,
}: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [keywords, setKeywords] = useState<string[]>(qa.keywords);
  const [keywordInput, setKeywordInput] = useState("");
  const [status, setStatus] = useState<QAStatus>(qa.status);
  const [isPick, setIsPick] = useState<boolean>(qa.is_pick ?? false);
  const [youtubeUrl, setYoutubeUrl] = useState(qa.video?.youtube_url ?? "");
  const [videoTopic, setVideoTopic] = useState(qa.video?.topic ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  // meta는 JSON 문자열일 수도 / null 일 수도 — reviewed_at 마킹용 헬퍼
  function buildUpdatedMeta(extra: Record<string, unknown>): string | null {
    let parsed: Record<string, unknown> = {};
    if (qa.meta) {
      try {
        const v = JSON.parse(qa.meta);
        if (v && typeof v === "object" && !Array.isArray(v)) {
          parsed = v as Record<string, unknown>;
        }
      } catch {
        // 기존 meta가 JSON이 아니면 보존하지 않고 새로 시작
        parsed = { _legacy: qa.meta };
      }
    }
    const merged = { ...parsed, ...extra };
    return JSON.stringify(merged);
  }

  function save(toStatus?: QAStatus, opts?: { markReviewed?: boolean; redirectAfter?: string }) {
    const finalStatus = toStatus ?? status;
    setError(null);
    setInfo(null);
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();
      const updatePayload: Record<string, unknown> = {
        question: question.trim(),
        answer: answer.trim(),
        keywords,
        status: finalStatus,
        is_pick: isPick,
        published: finalStatus === "published",
      };
      if (opts?.markReviewed) {
        updatePayload.meta = buildUpdatedMeta({
          reviewed_at: new Date().toISOString(),
        });
      }

      const { error: upErr } = await supabase
        .from("qas")
        .update(updatePayload)
        .eq("id", qa.id);
      if (upErr) {
        const msg = upErr.message ?? "저장 실패";
        if (msg.includes("PICK_LIMIT_EXCEEDED")) {
          setError("Pick은 한 원장당 최대 5개까지 가능합니다. 다른 글의 Pick을 먼저 해제해주세요.");
        } else {
          setError(`저장 실패: ${msg}`);
        }
        return;
      }

      // 영상 정보 업데이트 (같은 video 공유 글에 모두 영향)
      if (qa.video_id && (youtubeUrl !== (qa.video?.youtube_url ?? "") ||
        videoTopic !== (qa.video?.topic ?? ""))) {
        const { error: vErr } = await supabase
          .from("videos")
          .update({
            youtube_url: youtubeUrl.trim(),
            topic: videoTopic.trim() || null,
          })
          .eq("id", qa.video_id);
        if (vErr) {
          setError(`영상 정보 저장 실패: ${vErr.message}`);
          return;
        }
      }

      setStatus(finalStatus);
      if (opts?.redirectAfter) {
        router.push(opts.redirectAfter);
      } else if (toStatus) {
        // 상태 전환 후 목록으로
        router.push(`/me/qnas?status=${finalStatus}`);
      } else {
        setInfo("저장되었습니다.");
        router.refresh();
      }
    });
  }

  function reject() {
    if (!confirm("이 초안을 반려할까요? 상태가 '초안'으로 돌아가고 관리자가 다시 작성·요청해야 합니다.")) {
      return;
    }
    save("draft", { redirectAfter: "/me/qnas?status=draft" });
  }

  function deleteQA() {
    if (!confirm(`#${qa.id} 글을 영구 삭제할까요? 되돌릴 수 없습니다.`)) return;
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: delErr } = await supabase
        .from("qas")
        .delete()
        .eq("id", qa.id);
      if (delErr) {
        setError(`삭제 실패: ${delErr.message}`);
        return;
      }
      router.push("/me/qnas");
    });
  }

  const reviewedAt = (() => {
    if (!qa.meta) return null;
    try {
      const v = JSON.parse(qa.meta);
      if (v && typeof v === "object" && typeof v.reviewed_at === "string") {
        return v.reviewed_at;
      }
    } catch {
      // ignore
    }
    return null;
  })();

  const isPending = qa.status === "pending_review";

  return (
    <div className="space-y-4">
      {/* 검수 안내 (pending_review일 때) */}
      {isPending && (
        <div className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-bold">📝 이 글은 검수 대기 중입니다.</div>
          <p className="mt-1 text-xs">
            관리자가 작성한 AI 초안입니다. 내용을 검토·수정한 뒤
            <strong> [발행]</strong>하거나, 부적절하다면 <strong>[반려]</strong>해주세요.
          </p>
        </div>
      )}

      {/* 메타 정보 */}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 text-sm text-[var(--text-secondary)]">
        <div className="flex flex-wrap gap-3">
          <span>
            상태:{" "}
            <span
              className="ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            >
              {STATUS_LABELS[status]}
            </span>
          </span>
          <span>타입: {qa.type === "qa" ? "원장 Q&A" : "사용자 글"}</span>
          <span>좋아요 {qa.like_count} · 조회 {qa.view_count} · 댓글 {commentCount}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
          <span>생성일: {new Date(qa.created_at).toLocaleDateString("ko-KR")}</span>
          {qa.video?.upload_date && (
            <span>업로드일: {qa.video.upload_date}</span>
          )}
          {qa.doctor && (
            <span>원장: {qa.doctor.name}</span>
          )}
          {reviewedAt && (
            <span className="text-green-700">
              ✓ 검수일: {new Date(reviewedAt).toLocaleDateString("ko-KR")}
            </span>
          )}
        </div>
      </div>

      {/* 편집 폼 */}
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        {/* 원장 — 변경 불가 (본인 doctor 고정) */}
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            원장님
          </label>
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text)]">
            {qa.doctor?.name ?? "—"}
            {qa.doctor?.branch && (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                ({qa.doctor.branch})
              </span>
            )}
            <span className="ml-2 text-[10px] text-[var(--text-muted)]">
              ※ 본인 doctor 고정 (변경 불가)
            </span>
          </div>
        </div>

        {/* Pick 토글 */}
        <div className="flex items-center justify-between rounded-md bg-[var(--bg-soft)] px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPick}
              onChange={(e) => setIsPick(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="font-semibold">⭐ Pick (원장님 추천)</span>
          </label>
          <span className="text-xs text-[var(--text-muted)]">
            현재 내 Pick: {doctorPickCount} / 5
          </span>
        </div>

        {/* 영상 정보 */}
        <div className="rounded-md border border-dashed border-[var(--border)] p-3">
          <div className="mb-2 text-xs text-[var(--text-muted)]">
            🎬 영상 정보 — 같은 영상을 공유하는 다른 글 {sameVideoQaCount}개에도 함께 적용됩니다
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                YouTube URL
              </label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                disabled={!qa.video_id}
                placeholder={qa.video_id ? "" : "(영상 연결 없음)"}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                영상 제목
              </label>
              <input
                type="text"
                value={videoTopic}
                onChange={(e) => setVideoTopic(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                disabled={!qa.video_id}
                placeholder={qa.video_id ? "(없음)" : "(영상 연결 없음)"}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            질문
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-base font-bold outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            답변 <span className="text-xs text-[var(--text-muted)]">({answer.length}자, 목표 350~450)</span>
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            키워드
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setKeywords((prev) => prev.filter((x) => x !== k))
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20"
              >
                {k} <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = keywordInput.trim().replace(/^#/, "");
                  if (!v || keywords.includes(v)) return;
                  setKeywords((prev) => [...prev, v]);
                  setKeywordInput("");
                }
              }}
              placeholder="키워드 입력 후 Enter"
              className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => {
                const v = keywordInput.trim().replace(/^#/, "");
                if (!v || keywords.includes(v)) return;
                setKeywords((prev) => [...prev, v]);
                setKeywordInput("");
              }}
              className="rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--bg-soft)]"
            >
              추가
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            상태
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QAStatus)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            {(Object.keys(STATUS_LABELS) as QAStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {info}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={deleteQA}
            disabled={isSaving}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            🗑 삭제
          </button>
          <div className="flex flex-wrap gap-2">
            {/* pending_review일 땐 반려 버튼 노출 */}
            {isPending && (
              <button
                type="button"
                onClick={reject}
                disabled={isSaving}
                className="rounded-md border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
              >
                ↩ 반려
              </button>
            )}

            {/* 저장 (현재 상태 유지) */}
            <button
              type="button"
              onClick={() => save(undefined, { markReviewed: true })}
              disabled={isSaving}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] disabled:opacity-50"
              title="현재 상태로 저장 (검수 마킹 포함)"
            >
              💾 저장
            </button>

            {/* 발행 (published 아닐 때) */}
            {status !== "published" && (
              <button
                type="button"
                onClick={() => save("published", { markReviewed: true })}
                disabled={isSaving}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                🚀 {isPending ? "검수 완료 & 발행" : "발행"}
              </button>
            )}

            {/* 발행됨 → 비공개로 */}
            {status === "published" && (
              <button
                type="button"
                onClick={() => save("archived")}
                disabled={isSaving}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] disabled:opacity-50"
              >
                📥 비공개로
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

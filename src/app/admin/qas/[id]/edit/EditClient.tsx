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

type QA = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  status: "draft" | "pending_review" | "published" | "archived";
  type: "qa" | "post";
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
  doctors: Doctor[];
};

const STATUS_LABELS: Record<QA["status"], string> = {
  draft: "초안",
  pending_review: "검수 대기",
  published: "발행됨",
  archived: "보관",
};

const STATUS_COLORS: Record<QA["status"], string> = {
  draft: "#9E9E9E",
  pending_review: "#FFA000",
  published: "#4CAF50",
  archived: "#616161",
};

export default function EditClient({ qa, doctors }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [keywordsText, setKeywordsText] = useState(qa.keywords.join(", "));
  const [doctorId, setDoctorId] = useState<string | null>(qa.doctor_id);
  const [status, setStatus] = useState<QA["status"]>(qa.status);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function save(toStatus?: QA["status"]) {
    const finalStatus = toStatus ?? status;
    setError(null);
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();
      const keywords = keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const { error: upErr } = await supabase
        .from("qas")
        .update({
          question: question.trim(),
          answer: answer.trim(),
          keywords,
          doctor_id: doctorId,
          status: finalStatus,
          published: finalStatus === "published",
        })
        .eq("id", qa.id);
      if (upErr) {
        setError(`저장 실패: ${upErr.message}`);
        return;
      }
      // 상태 반영
      setStatus(finalStatus);
      if (toStatus) {
        // 발행/보관 등 상태 전환 시 목록으로
        router.push(`/admin/qas?status=${finalStatus}`);
      } else {
        router.refresh();
      }
    });
  }

  function deleteQA() {
    if (!confirm(`Q&A #${qa.id} 를 영구 삭제할까요? 되돌릴 수 없습니다.`)) return;
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
      router.push("/admin/qas");
    });
  }

  return (
    <div className="space-y-4">
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
          <span>좋아요 {qa.like_count} · 조회 {qa.view_count}</span>
          <span className="text-[var(--text-muted)]">
            {new Date(qa.created_at).toLocaleString("ko-KR")}
          </span>
        </div>
        {qa.video?.youtube_url && (
          <div className="mt-2 text-xs">
            영상:{" "}
            <a
              href={qa.video.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              {qa.video.youtube_id}
            </a>
            {qa.video.topic && <> · {qa.video.topic}</>}
          </div>
        )}
      </div>

      {/* 편집 폼 */}
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            매칭 원장
          </label>
          <select
            value={doctorId ?? ""}
            onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            <option value="">— 없음 —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.branch ? `(${d.branch})` : ""}
              </option>
            ))}
          </select>
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
            키워드 (쉼표로 구분)
          </label>
          <input
            type="text"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            상태
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QA["status"])}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            {(Object.keys(STATUS_LABELS) as QA["status"][]).map((s) => (
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
            <button
              type="button"
              onClick={() => save()}
              disabled={isSaving}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] disabled:opacity-50"
            >
              💾 저장
            </button>
            {status !== "published" && (
              <button
                type="button"
                onClick={() => save("published")}
                disabled={isSaving}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                🚀 발행
              </button>
            )}
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

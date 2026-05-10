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
  doctors: Doctor[];
  /** 같은 doctor의 현재 Pick 개수 (5개 제한 표시용) */
  doctorPickCount?: number;
  /** 같은 video를 공유하는 다른 qa 개수 (영상 정보 변경 시 같이 영향받는 글) */
  sameVideoQaCount?: number;
  /** 댓글 개수 (Phase B 통합 후 활성) */
  commentCount?: number;
};

const STATUS_LABELS: Record<QA["status"], string> = {
  draft: "초안",
  pending_review: "대기",
  published: "발행",
  archived: "보관",
};

const STATUS_COLORS: Record<QA["status"], string> = {
  draft: "#9E9E9E",
  pending_review: "#FFA000",
  published: "#4CAF50",
  archived: "#616161",
};

export default function EditClient({
  qa,
  doctors,
  doctorPickCount = 0,
  sameVideoQaCount = 0,
  commentCount = 0,
}: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState(qa.question);
  const [answer, setAnswer] = useState(qa.answer);
  const [keywords, setKeywords] = useState<string[]>(qa.keywords);
  const [keywordInput, setKeywordInput] = useState("");
  const [doctorId, setDoctorId] = useState<string | null>(qa.doctor_id);
  const [status, setStatus] = useState<QA["status"]>(qa.status);
  const [isPick, setIsPick] = useState<boolean>(qa.is_pick ?? false);
  const [youtubeUrl, setYoutubeUrl] = useState(qa.video?.youtube_url ?? "");
  const [videoTopic, setVideoTopic] = useState(qa.video?.topic ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function save(toStatus?: QA["status"]) {
    const finalStatus = toStatus ?? status;
    setError(null);
    startSave(async () => {
      const supabase = createSupabaseBrowserClient();
      // 1) qas update
      const { error: upErr } = await supabase
        .from("qas")
        .update({
          question: question.trim(),
          answer: answer.trim(),
          keywords,
          doctor_id: doctorId,
          status: finalStatus,
          is_pick: isPick,
          published: finalStatus === "published",
        })
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
      // 2) videos update (youtube_url + topic — 같은 영상 공유 qas 모두 영향)
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
      // 상태 반영
      setStatus(finalStatus);
      if (toStatus) {
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
          <span>좋아요 {qa.like_count} · 조회 {qa.view_count} · 댓글 {commentCount}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
          <span>생성일: {new Date(qa.created_at).toLocaleDateString("ko-KR")}</span>
          {qa.video?.upload_date && (
            <span>업로드일: {qa.video.upload_date}</span>
          )}
        </div>
      </div>

      {/* 편집 폼 */}
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            글쓴이
          </label>
          <select
            value={doctorId ?? ""}
            onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            <option value="">— 없음 —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
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
            <span className="font-semibold">Pick (원장님 추천)</span>
          </label>
          <span className="text-xs text-[var(--text-muted)]">
            현재 이 원장 Pick: {doctorPickCount} / 5
          </span>
        </div>

        {/* 영상 정보 — 다른 input과 동일 층위 */}
        <p className="-mb-1 text-xs text-[var(--text-muted)]">
          🎬 영상 정보 — 같은 영상을 공유하는 다른 글 {sameVideoQaCount}개에도 함께 적용됩니다
        </p>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            YouTube URL
          </label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            disabled={!qa.video_id}
            placeholder={qa.video_id ? "" : "(영상 연결 없음)"}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            영상 제목
          </label>
          <input
            type="text"
            value={videoTopic}
            onChange={(e) => setVideoTopic(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            disabled={!qa.video_id}
            placeholder={qa.video_id ? "(없음)" : "(영상 연결 없음)"}
          />
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
            태그
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
              placeholder="태그 입력 후 Enter"
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

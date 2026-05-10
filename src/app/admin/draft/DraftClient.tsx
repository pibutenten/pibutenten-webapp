"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type DraftQA = {
  question: string;
  answer: string;
  keywords: string[];
};

type MatchedDoctor = { slug: string; name: string };

type GenerateResult = {
  videoId: string;
  title: string | null;
  doctorSlug?: string;
  doctorName?: string;
  matchedDoctors?: MatchedDoctor[];
  needsManualDoctor?: boolean;
  message?: string;
  drafts?: DraftQA[];
};

type Props = {
  doctors: Doctor[];
};

export default function DraftClient({ doctors }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  // "" = 자동 매칭 시도 (서버에서 영상 제목/자막에서 원장 이름 검색)
  const [doctorSlug, setDoctorSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  // 사용자가 수정 중인 drafts (생성 직후 result.drafts 복사)
  const [editing, setEditing] = useState<DraftQA[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [isGenerating, startGen] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setEditing([]);
    setSaved(new Set());
    startGen(async () => {
      try {
        const res = await fetch("/api/admin/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), doctorSlug }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? `초안 생성 실패 (${res.status})`);
          return;
        }
        setResult(data);
        // 자동 매칭 결과를 select에 반영 (사용자가 변경 가능)
        if (data.doctorSlug) setDoctorSlug(data.doctorSlug);
        // 자동 매칭 실패 — drafts 없음, 사용자가 select 후 다시 시도
        if (data.needsManualDoctor) {
          setError(
            data.message ?? "원장을 자동 매칭하지 못했습니다. 직접 선택 후 다시 시도해주세요.",
          );
          return;
        }
        setEditing(data.drafts ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    });
  }

  function updateDraft(idx: number, patch: Partial<DraftQA>) {
    setEditing((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }

  function saveDraft(idx: number) {
    if (!result || !doctorSlug) return;
    const draft = editing[idx];
    if (!draft) return;
    startSave(async () => {
      try {
        const res = await fetch("/api/admin/draft/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctorSlug,
            videoId: result.videoId,
            videoTitle: result.title,
            youtubeUrl: url.trim(),
            draft,
            status: "pending_review", // 저장 시 원장 검수 대기 상태
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(`저장 실패: ${data?.error ?? res.status}`);
          return;
        }
        setSaved((prev) => new Set(prev).add(idx));
      } catch (e) {
        alert(e instanceof Error ? e.message : "네트워크 오류");
      }
    });
  }

  function saveAll() {
    if (!result) return;
    startSave(async () => {
      try {
        const res = await fetch("/api/admin/draft/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctorSlug,
            videoId: result.videoId,
            videoTitle: result.title,
            youtubeUrl: url.trim(),
            drafts: editing.filter((_, i) => !saved.has(i)),
            status: "pending_review",
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(`일괄 저장 실패: ${data?.error ?? res.status}`);
          return;
        }
        setSaved(new Set(editing.map((_, i) => i)));
        // 저장 후 admin 목록으로 이동 옵션
        if (confirm("모두 저장되었습니다. 전체 목록으로 이동할까요?")) {
          router.push("/admin/qas?status=pending_review");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "네트워크 오류");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* 입력 폼 */}
      <form
        onSubmit={handleGenerate}
        className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
      >
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            YouTube 영상 URL
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">
            원장님 <span className="text-xs text-[var(--text-muted)]">(비워두면 영상에서 자동 감지)</span>
          </label>
          <select
            value={doctorSlug}
            onChange={(e) => setDoctorSlug(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          >
            <option value="">— 자동 감지 —</option>
            {doctors.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={isGenerating || !url.trim() || !doctorSlug}
          className="w-full rounded-md bg-[var(--primary)] py-2.5 font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {isGenerating ? "AI가 초안 생성 중… (수십 초 소요)" : "초안 생성"}
        </button>
        <p className="text-xs text-[var(--text-muted)]">
          자막 fetch + Claude API 호출. 30~90초 정도 걸립니다.
        </p>
      </form>

      {/* 결과 */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
            <div className="text-xs text-[var(--text-muted)]">
              영상 ID: <code>{result.videoId}</code>
              {result.title && <> · {result.title}</>}
            </div>
            <div className="mt-1 text-sm">
              <b>{editing.length}</b>개 초안 생성됨 (
              <b>{saved.size}</b>개 저장 완료)
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={saveAll}
                disabled={isSaving || saved.size === editing.length}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isSaving
                  ? "저장 중…"
                  : saved.size === editing.length
                  ? "모두 저장됨"
                  : `남은 ${editing.length - saved.size}개 일괄 저장 (검수 대기)`}
              </button>
            </div>
          </div>

          {editing.map((draft, idx) => (
            <article
              key={idx}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5"
              style={{
                opacity: saved.has(idx) ? 0.55 : 1,
                borderLeft: saved.has(idx)
                  ? "3px solid #4CAF50"
                  : "3px solid #FFA000",
              }}
            >
              <div className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                {saved.has(idx) ? "✓ 저장됨" : `초안 #${idx + 1}`}
              </div>
              <input
                type="text"
                value={draft.question}
                onChange={(e) =>
                  updateDraft(idx, { question: e.target.value })
                }
                disabled={saved.has(idx)}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-base font-bold outline-none focus:border-[var(--primary)]"
                placeholder="질문"
              />
              <textarea
                value={draft.answer}
                onChange={(e) =>
                  updateDraft(idx, { answer: e.target.value })
                }
                disabled={saved.has(idx)}
                rows={7}
                className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                placeholder="답변 (7~8문장 / 350~450자)"
              />
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                글자 수: {draft.answer.length}자 (목표 350~450)
              </div>
              <input
                type="text"
                value={draft.keywords.join(", ")}
                onChange={(e) =>
                  updateDraft(idx, {
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean),
                  })
                }
                disabled={saved.has(idx)}
                className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                placeholder="태그 (쉼표로 구분)"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => saveDraft(idx)}
                  disabled={isSaving || saved.has(idx)}
                  className="rounded-md border border-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
                >
                  {saved.has(idx) ? "저장됨" : "이 초안만 저장"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

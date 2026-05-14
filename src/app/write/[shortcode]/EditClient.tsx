"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  qaId: number;
  type: "qa" | "post";
  initialTitle: string;
  initialBody: string;
  initialKeywords: string[];
  /** 저장·취소 후 돌아갈 URL (예: /{handle}/{shortcode}) */
  returnUrl: string;
};

const KEYWORD_MAX = 10;

export default function EditClient({
  qaId,
  type,
  initialTitle,
  initialBody,
  initialKeywords,
  returnUrl,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [keywordInput, setKeywordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addKeyword(k: string) {
    const v = k.trim().replace(/^#/, "");
    if (!v) return;
    if (keywords.includes(v)) return;
    if (keywords.length >= KEYWORD_MAX) {
      setError(`태그는 최대 ${KEYWORD_MAX}개까지 가능합니다.`);
      return;
    }
    setKeywords((prev) => [...prev, v]);
    setKeywordInput("");
    setError(null);
  }

  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x !== k));
  }

  function save() {
    setError(null);
    if (!title.trim()) {
      setError(type === "qa" ? "질문을 입력해주세요." : "제목을 입력해주세요.");
      return;
    }
    if (!body.trim()) {
      setError(type === "qa" ? "답변을 입력해주세요." : "본문을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const sb = createSupabaseBrowserClient();
      const { error: updErr } = await sb
        .from("qas")
        .update({
          question: title.trim(),
          answer: body.trim(),
          keywords,
        })
        .eq("id", qaId);
      if (updErr) {
        setError("저장 실패: " + updErr.message);
        return;
      }
      router.push(returnUrl);
      router.refresh();
    });
  }

  const titleLabel = type === "qa" ? "질문" : "제목";
  const bodyLabel = type === "qa" ? "답변" : "본문";

  return (
    <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      {/* 제목 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {titleLabel}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* 본문 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {bodyLabel}{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            ({body.length} / 4000)
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          maxLength={4000}
          className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* 태그 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          태그{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            최대 {KEYWORD_MAX}개
          </span>
        </label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => removeKeyword(k)}
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
                addKeyword(keywordInput);
              }
            }}
            placeholder="태그 입력 후 Enter"
            className="h-9 flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => addKeyword(keywordInput)}
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--bg-soft)]"
          >
            추가
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 액션 */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => router.push(returnUrl)}
          disabled={pending}
          className="h-10 rounded-md border border-[var(--border)] px-4 text-sm hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 rounded-md bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import KeywordsEditor from "@/components/card-editor/KeywordsEditor";

type Props = {
  cardId: number;
  type: "qa" | "post";
  initialTitle: string;
  initialBody: string;
  initialKeywords: string[];
  /** 저장·취소 후 돌아갈 URL (예: /{handle}/{shortcode}) */
  returnUrl: string;
};

const KEYWORD_MAX = 10;

export default function EditClient({
  cardId,
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        .from("cards")
        .update({
          question: title.trim(),
          answer: body.trim(),
          keywords,
        })
        .eq("id", cardId);
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
      <KeywordsEditor
        keywords={keywords}
        onChange={setKeywords}
        onError={setError}
        max={KEYWORD_MAX}
        disabled={pending}
      />


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

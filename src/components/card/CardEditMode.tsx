"use client";

/**
 * 카드 인라인 편집 모드 (Phase 4-5 추출).
 *
 * 본인/관리자 권한 검증은 호출자(Card.tsx)에서 처리.
 * 이 컴포넌트는 순수 폼 — title/body 입력 + cancel/save 버튼.
 * 실제 저장 로직은 onSave 콜백에서 호출자가 수행.
 */
import { useState } from "react";

type Props = {
  initialTitle: string;
  initialBody: string;
  /** 저장 중 (스피너/disabled) */
  saving: boolean;
  onCancel: () => void;
  onSave: (title: string, body: string) => void;
};

export default function CardEditMode({
  initialTitle,
  initialBody,
  saving,
  onCancel,
  onSave,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  return (
    <div className="mb-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[15px] font-bold focus:border-[var(--primary)] focus:outline-none"
        placeholder="제목"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        maxLength={4000}
        className="w-full resize-y rounded-md border border-[var(--border)] p-3 text-[14px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
        placeholder="본문"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onSave(title, body)}
          disabled={saving}
          className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

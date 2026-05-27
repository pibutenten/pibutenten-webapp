"use client";

/**
 * CardEditorBody — CardEditor 본문 영역 (P2-2, 2026-05-27 분리).
 *
 * 담당 UI:
 *   - 제목 input (200자 한도)
 *   - 본문 — Q&A 면 MarkdownBoldEditor (Ctrl+B 형광펜), 그 외 카테고리는 textarea
 *
 * 2026-05-22 사용자 결정: 라벨 통일 — qa 도 "제목"/"본문" (옛 "질문"/"답변" 폐기)
 *
 * Presentational only.
 */

import MarkdownBoldEditor from "@/components/MarkdownBoldEditor";
import { pickHighlight } from "@/lib/card-highlight";

export type CardEditorBodyProps = {
  titleLabel: string;
  bodyLabel: string;
  title: string;
  onChangeTitle: (v: string) => void;
  body: string;
  onChangeBody: (v: string) => void;
  bodyMax: number;
  isQa: boolean;
  highlightSeed: string;
  pending: boolean;
};

export default function CardEditorBody({
  titleLabel,
  bodyLabel,
  title,
  onChangeTitle,
  body,
  onChangeBody,
  bodyMax,
  isQa,
  highlightSeed,
  pending,
}: CardEditorBodyProps) {
  return (
    <>
      {/* 제목 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {titleLabel}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          maxLength={200}
          disabled={pending}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* 본문 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          {bodyLabel}{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            ({body.length} / {bodyMax})
          </span>
        </label>
        {isQa ? (
          <MarkdownBoldEditor
            value={body}
            onChange={onChangeBody}
            highlightColor={pickHighlight(highlightSeed)}
            disabled={pending}
            placeholder="답변을 입력하세요. 텍스트 선택 후 Ctrl+B 누르면 형광펜이 적용됩니다."
            minHeight={280}
          />
        ) : (
          <textarea
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            rows={12}
            maxLength={bodyMax}
            disabled={pending}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          />
        )}
      </div>
    </>
  );
}

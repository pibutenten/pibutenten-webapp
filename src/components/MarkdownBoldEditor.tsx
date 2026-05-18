"use client";

import { useEffect, useRef } from "react";

/**
 * Q&A 본문 전용 단순 WYSIWYG 편집기 (굵게 1개 기능만).
 *
 * - contentEditable div. **마크다운 문자열이 사용자 화면에 노출되지 않음**.
 * - 굵게(`**foo**`)는 즉시 `<strong>` + 형광펜 배경으로 시각화.
 * - 강조 토글: 버튼 클릭 또는 Ctrl+B. document.execCommand('bold') 기반.
 * - undo: 브라우저 native (Ctrl+Z).
 * - 단락은 빈 줄 (Enter 두 번). HTML로는 `<br>` 두 개.
 * - 복붙 시 plain text로 강제 변환 (포맷 유실 방지).
 *
 * value는 markdown 문자열. uncontrolled — 초기 1회만 div.innerHTML로 set.
 * 입력 후 onInput에서 HTML→markdown 변환해 onChange 호출.
 */

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  /** 형광펜 색 (rgba) — 카드 ID 해시 기반. <strong>에 인라인 적용 */
  highlightColor: string;
  /** disabled 상태 */
  disabled?: boolean;
  /** placeholder (빈 상태일 때만 표시) */
  placeholder?: string;
  /** textarea의 rows 추정용 — px 단위 최소 높이 */
  minHeight?: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mdToHtml(md: string): string {
  if (!md) return "";
  // 1) escape
  // 2) **foo** → <strong>foo</strong>  (escape 후 적용해도 안전: **는 HTML이 아니라 그대로 통과)
  // 3) \n → <br>
  return escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function htmlToMd(html: string): string {
  if (!html) return "";
  let out = html
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    // Chrome contentEditable이 줄바꿈을 <div>로 묶음
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "")
    .replace(/<p\b[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""); // 잔여 태그 제거
  // HTML 엔티티 디코딩
  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  // 첫·마지막 줄바꿈 정리 (Chrome이 처음에 \n을 자주 붙임)
  out = out.replace(/^\n+/, "").replace(/\n+$/, "");
  return out;
}

export default function MarkdownBoldEditor({
  value,
  onChange,
  highlightColor,
  disabled,
  placeholder,
  minHeight = 280,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const initialized = useRef(false);

  // 초기 1회만 value → innerHTML. 이후엔 사용자 입력으로 자체 관리 (controlled X — cursor 보존).
  useEffect(() => {
    if (!divRef.current || initialized.current) return;
    divRef.current.innerHTML = mdToHtml(value);
    initialized.current = true;
  }, [value]);

  function handleInput() {
    if (!divRef.current) return;
    onChange(htmlToMd(divRef.current.innerHTML));
  }

  function toggleBold() {
    if (disabled) return;
    // execCommand는 deprecated이지만 contentEditable 굵게 토글에 가장 안정적이고
    // native undo history에도 잘 등록됨. 모든 주요 브라우저 지원.
    document.execCommand("bold");
    handleInput();
    divRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      toggleBold();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    document.execCommand("insertText", false, text);
    handleInput();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleBold}
          disabled={disabled}
          title="강조 (Ctrl+B) — 선택한 텍스트에 형광펜 적용"
          className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        >
          강조
        </button>
      </div>
      <div
        ref={divRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        spellCheck={false}
        data-placeholder={placeholder ?? "본문을 입력하세요"}
        className="markdown-bold-editor w-full whitespace-pre-wrap rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[15px] leading-[1.7] text-[var(--text)] outline-none focus:border-[var(--primary)] empty:before:text-[var(--text-muted)] empty:before:content-[attr(data-placeholder)]"
        style={
          {
            minHeight: `${minHeight}px`,
            // CSS 변수로 형광펜 색 주입. <strong> 자식에 globals.css의
            // .markdown-bold-editor strong 룰로 적용.
            ["--qa-highlight-color" as string]: highlightColor,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

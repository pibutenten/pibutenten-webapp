"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" — 빨강 강조 (삭제 등). "primary" — 하늘색 (기본 액션) */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 디자인 톤에 맞춘 컨펌 다이얼로그.
 * - 백드롭 클릭 / ESC → 취소
 * - 확인 버튼 자동 포커스
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Tab 순환 트랩 + 닫힐 때 이전 포커스 복원 (R5-2).
  //   기존 초기 포커스(setTimeout 으로 confirm 버튼)는 아래 effect 그대로 —
  //   트랩은 setTimeout 발화 전에 activeElement(트리거)를 캡처하므로 충돌 없음.
  useFocusTrap(cardRef, open);

  // ESC 키로 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 확인 버튼에 포커스
    const id = window.setTimeout(() => confirmBtnRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden
      />

      {/* 카드 */}
      <div
        ref={cardRef}
        className="confirm-dialog-pop relative w-full max-w-[360px] rounded-[var(--radius-lg)] bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            backgroundColor: isDanger ? "#FFE4E8" : "var(--primary-soft)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={isDanger ? "#E91E63" : "var(--primary)"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden
          >
            {isDanger ? (
              <>
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
        </div>

        {/* 제목 */}
        <h2
          id="confirm-title"
          className="text-center text-[16px] font-bold text-[var(--text)]"
        >
          {title}
        </h2>

        {/* 설명 */}
        {description && (
          <p className="mt-1.5 whitespace-pre-line text-center text-[13px] leading-[1.6] text-[var(--text-secondary)]">
            {description}
          </p>
        )}

        {/* 버튼 영역 */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 flex-1 rounded-md border border-[var(--border)] bg-white text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={
              "h-10 flex-1 rounded-md text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            }
            style={{
              backgroundColor: isDanger ? "#E91E63" : "var(--primary)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .confirm-dialog-pop {
          animation: confirmPop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes confirmPop {
          from {
            opacity: 0;
            transform: scale(0.92);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

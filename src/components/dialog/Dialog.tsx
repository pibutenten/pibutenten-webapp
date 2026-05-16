"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Dialog 베이스 — 백드롭 / ESC 키 / body 스크롤 잠금 / z-index 토큰을 통합 관리.
 *
 * 사용 정책 (2026-05-17):
 *   - 신규 모달은 이 베이스를 사용.
 *   - 기존 4종 모달 (ConfirmDialog / LoginPromptDialog / LikersDialog / ImageCropDialog) 는
 *     회귀 위험 때문에 점진 마이그레이션. 한 번에 모두 교체하지 말 것.
 *
 * z-index 톤:
 *   - top=false (기본, 50): ConfirmDialog/LoginPromptDialog 같은 일반 모달
 *   - top=true (60): toast/alert 위에 올라가는 dialogs (LikersDialog, ImageCropDialog)
 *
 * 스크롤 잠금:
 *   - lockScroll=true (기본): body.style.overflow="hidden" — 카드 위에 모달 뜰 때
 *   - lockScroll=false: 잠금 X — 모바일 키보드/네이티브 dropdown 우선 시 (LikersDialog 등에서 의도적)
 */

type Props = {
  open: boolean;
  onClose: () => void;
  /** 'top' = z-60 (다른 모달 위), 기본 = z-50. */
  layer?: "base" | "top";
  /** body 스크롤 잠금 여부 (default: true). */
  lockScroll?: boolean;
  /** 백드롭 클릭 시 onClose 호출 여부 (default: true). false면 명시 버튼만 닫기. */
  closeOnBackdrop?: boolean;
  /** ARIA 라벨링용 */
  ariaLabelledBy?: string;
  className?: string;
  children: ReactNode;
};

export default function Dialog({
  open,
  onClose,
  layer = "base",
  lockScroll = true,
  closeOnBackdrop = true,
  ariaLabelledBy,
  className,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    let prevOverflow = "";
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      if (lockScroll) document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, lockScroll]);

  if (!open) return null;

  const zClass = layer === "top" ? "z-[100]" : "z-[60]";

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center px-4 ${className ?? ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        className="relative w-full max-w-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

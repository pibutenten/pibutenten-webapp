"use client";

import { useEffect, useRef } from "react";

/**
 * 작성 중 이탈 확인 모달 — useUnsavedChangesGuard 와 함께 사용.
 */
export default function UnsavedChangesModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="작성 중인 내용이 있습니다"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 24px 20px",
          maxWidth: 320,
          width: "calc(100% - 48px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "#1e2a35",
            marginBottom: 8,
          }}
        >
          작성 중인 내용이 있어요
        </h2>
        <p style={{ fontSize: 14, color: "#7b8794", lineHeight: 1.5 }}>
          이 페이지를 떠나면 작성 중인 내용이 사라집니다.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 20,
            justifyContent: "flex-end",
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid #edf2f5",
              background: "#f7f9fb",
              color: "#3c4856",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            계속 작성
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#FF6B81",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            나가기
          </button>
        </div>
      </div>
    </div>
  );
}

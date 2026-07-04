"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * 작성 중 이탈 확인 모달 — useUnsavedChangesGuard 와 함께 사용.
 *
 * variant:
 *   - "create": 신규 글쓰기. 제목 "작성 중인 글쓰기를 종료하시겠습니까?",
 *               버튼 [임시저장 후 종료] / [글쓰기 종료]. (localStorage 임시저장 슬롯 존재)
 *   - "edit":   수정. 제목 "작성 중인 내용이 있어요", 버튼 [계속 작성] / [나가기].
 *               (수정 모드는 임시저장 슬롯 개념이 없어 임시저장 버튼 미노출)
 *
 * 배경 클릭·Esc = onCancel(계속 작성).
 */
export default function UnsavedChangesModal({
  variant,
  onSaveDraft,
  onDiscard,
  onCancel,
}: {
  variant: "create" | "edit";
  onSaveDraft?: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Tab 순환 트랩 + 닫힐 때 이전 포커스 복원 (R5-2).
  //   ⚠ 아래 초기 포커스 effect 보다 먼저 호출 — effect 는 선언 순서대로 실행되므로
  //   트랩이 "열기 전" activeElement(트리거)를 primaryRef.focus() 이전에 캡처한다.
  // active 생략(항상 true) — 이 모달은 부모가 조건부 마운트하는 전제. open prop 을 도입하면 active 연동 필요.
  useFocusTrap(cardRef);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const isCreate = variant === "create";
  const title = isCreate
    ? "작성 중인 글쓰기를 종료하시겠습니까?"
    : "작성 중인 내용이 있어요";
  const description = isCreate
    ? "지금까지 작성한 내용을 임시저장할 수 있어요."
    : "이 페이지를 떠나면 작성 중인 내용이 사라집니다.";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
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
        ref={cardRef}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 24px 20px",
          maxWidth: 340,
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
          {title}
        </h2>
        <p style={{ fontSize: 14, color: "#7b8794", lineHeight: 1.5 }}>
          {description}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 20,
            justifyContent: "flex-end",
          }}
        >
          {isCreate ? (
            <>
              <button
                type="button"
                onClick={onDiscard}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #edf2f5",
                  background: "#f7f9fb",
                  color: "#3c4856",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                글쓰기 종료
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={onSaveDraft}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#FF6B81",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                임시저장 후 종료
              </button>
            </>
          ) : (
            <>
              <button
                ref={primaryRef}
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
                onClick={onDiscard}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * CommentForm — 댓글/답글 입력 폼 (2026-05-28 분리).
 *
 * 옛: CommentsBlock.tsx 안 inline 함수 (L716~860).
 * 현재: 자기충족 컴포넌트 (useRef + useEffect 만 의존). 동작 변경 0.
 *
 * 사양 (옛 코드 그대로):
 *   - R 20px 고정, 테두리 #DCE3E7 1px (포커스 시 primary)
 *   - 최소 높이 40px (textarea 늘면 컨테이너도 늘어남)
 *   - Enter → 등록 / Shift+Enter → 줄바꿈
 *   - IME 조합 중(한글) Enter 무시 (isComposing/keyCode 229)
 *   - 등록 버튼: comment_btn_enabled / disabled SVG 1:1 사용 (28×28)
 *   - 1500자 이상 글자수 카운트 노출 (1900 이상 빨간색)
 *   - 마운트 시 autofocus (disableAutoFocus=true 면 생략)
 */

import { useEffect, useRef } from "react";

type Props = {
  body: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  placeholder?: string;
  /** 더 이상 사용하지 않음 — 답글 취소는 헤더 라인의 [답글 취소] inline 토글로 대체 */
  onCancel?: () => void;
  /** true면 마운트 시 자동 포커스 안 함 (단독 URL 자동 펼침에서 키보드 방지) */
  disableAutoFocus?: boolean;
};

export default function CommentForm({
  body,
  onChange,
  onSubmit,
  submitting,
  placeholder,
  disableAutoFocus = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 마운트 시 자동 포커스 — 댓글창/답글창 열림 즉시 입력 가능 (모바일 키보드 자동 활성)
  // disableAutoFocus=true면 (단독 URL 자동 펼침 등) 포커스 생략.
  useEffect(() => {
    if (disableAutoFocus) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // iOS Safari: 직접 focus만으론 키보드 안 뜰 수 있어 두 단계 시도
    ta.focus();
    // 다음 프레임에 한 번 더 시도 (조건부 렌더 직후 안정화 대기)
    const id = window.setTimeout(() => {
      ta.focus();
      // 커서를 끝으로
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [disableAutoFocus]);

  const submitDisabled = submitting || !body.trim();

  return (
    /* 댓글 입력 박스 (스펙):
       - R: 고정 20px (textarea 높이 늘어나도 모서리 R 보존, 원형으로 변형되지 않음)
       - 테두리: #DCE3E7 / 1px (포커스 시 primary)
       - 높이: 40px (textarea가 늘면 컨테이너도 늘어남)
       - 폰트 13pt, placeholder 색 #A2A6AF
       - 텍스트 세로 중앙 정렬 (line-height + 수직 padding 으로 정확히 40px)
       - 등록 버튼: comment_btn_enabled / disabled SVG 1:1 사용 (28×28) */
    <div
      className="flex items-center gap-1 rounded-[20px] border bg-white pl-1 pr-1 min-h-[40px] focus-within:border-[var(--primary)]"
      style={{ borderColor: "#DCE3E7", borderWidth: "1px" }}
    >
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          autoFocus={!disableAutoFocus}
          value={body}
          onChange={(e) => {
            onChange(e.target.value);
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = t.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            // Enter → 등록 / Shift+Enter → 줄바꿈
            // IME 조합 중(한글 입력)에는 isComposing/keyCode 229로 무시
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              if (!submitting && body.trim()) onSubmit();
            }
          }}
          placeholder={placeholder ?? "댓글을 입력하세요"}
          rows={1}
          maxLength={2000}
          // 폰트 13pt, line-height 20px + py 10px = 단일 라인 시 정확히 40px (컨테이너 높이와 일치 → 세로 중앙)
          className={
            "block w-full resize-none overflow-hidden border-0 bg-transparent px-3 text-[13px] leading-[20px] placeholder:text-[#A2A6AF] focus:outline-none focus:ring-0 " +
            (body.length >= 1500 ? "pr-14 pb-5" : "")
          }
          style={{ paddingTop: "10px", paddingBottom: "10px" }}
        />
        {/* 글자수 카운트 — 1500자 이상부터만 노출 (한도 임박 알림) */}
        {body.length >= 1500 && (
          <span
            className="pointer-events-none absolute bottom-1 right-2 text-[10px]"
            style={{
              color: body.length >= 1900 ? "#E91E63" : "var(--text-muted)",
            }}
          >
            {body.length}/2000
          </span>
        )}
      </div>
      {/* 등록 — comment_btn SVG 1:1 사용 (28×28). disabled 상태별 SVG 교체.
          self-center 로 multi-line 시 세로 중앙 유지. */}
      <button
        type="button"
        aria-label="등록"
        title="등록"
        className="self-center shrink-0 flex h-7 w-7 items-center justify-center disabled:cursor-not-allowed"
        disabled={submitDisabled}
        onPointerDown={(e) => {
          // 한글 IME 조합 종료 강제 — composition 이 끝나야 body 가 갱신되고 disabled 해제됨
          const ta = textareaRef.current;
          if (ta && document.activeElement === ta) {
            ta.blur();
            ta.focus();
          }
          void e;
        }}
        onClick={() => {
          if (submitting || !body.trim()) return;
          onSubmit();
        }}
      >
        {submitting ? (
          <span className="text-[12px]">…</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              submitDisabled
                ? "/icons/comment_btn_disabled.svg"
                : "/icons/comment_btn_enabled.svg"
            }
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
            aria-hidden
          />
        )}
      </button>
    </div>
  );
}

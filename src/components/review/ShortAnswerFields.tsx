"use client";

/**
 * ShortAnswerFields — 단독 후기폼(/review/new)의 "단답 2칸".
 *
 * 동작:
 *   - 부모가 전달한 질문 풀(question_pool 의 timepoint='any' AND is_active 후보)에서
 *     마운트 시 2개 칸에 서로 다른 질문 1개씩 랜덤 배정(두 칸 중복 방지).
 *   - 각 칸: 질문 텍스트 + "다시 고르기"(미사용 질문으로 교체, 다른 칸과 중복 방지) + 답 입력(≤300).
 *   - 풀이 비면 컴포넌트 전체를 graceful 하게 렌더하지 않음(부모가 null 반환).
 *   - 풀이 1개뿐이면 칸 1개만 노출(두 칸 중복 방지 우선).
 *
 * 상태 보고:
 *   - onChange(answers) 로 현재 두(또는 한) 칸의 { question_id, answer_text } 를 부모에 전달.
 *   - 빈 답 필터링은 부모(제출 직전)·RPC(short_answer_response INSERT)가 함께 수행하므로,
 *     본 컴포넌트는 칸 상태를 그대로 보고(빈 답도 포함). 부모가 trim 후 빈 항목을 제거.
 *
 * 랜덤은 클라이언트(Math.random) 허용 — 서버 렌더 일관성 불필요(작성 단계 입력 보조).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ShortAnswerQuestion = { id: number; text: string };
export type ShortAnswerValue = { question_id: number; answer_text: string };

const ANSWER_MAX = 300;

/** 슬롯 — 현재 질문 id + 답 텍스트. */
type Slot = { questionId: number; answer: string };

/** 배열에서 무작위 1개 인덱스. */
function randomIndex(len: number): number {
  return Math.floor(Math.random() * len);
}

export default function ShortAnswerFields({
  questions,
  onChange,
  disabled,
}: {
  questions: ShortAnswerQuestion[];
  onChange: (answers: ShortAnswerValue[]) => void;
  disabled?: boolean;
}) {
  // 질문 id→텍스트 조회용 맵.
  const textById = useMemo(() => {
    const m = new Map<number, string>();
    for (const q of questions) m.set(q.id, q.text);
    return m;
  }, [questions]);

  // 노출할 칸 수 — 풀 크기 기준 최대 2(두 칸 중복 방지 우선).
  const slotCount = Math.min(2, questions.length);

  // 초기 슬롯: 서로 다른 질문 랜덤 배정(마운트 1회 고정).
  const [slots, setSlots] = useState<Slot[]>(() => {
    if (questions.length === 0) return [];
    const pool = [...questions];
    const picked: Slot[] = [];
    for (let i = 0; i < slotCount && pool.length > 0; i++) {
      const idx = randomIndex(pool.length);
      picked.push({ questionId: pool[idx].id, answer: "" });
      pool.splice(idx, 1); // 두 칸 중복 방지.
    }
    return picked;
  });

  // "다시 고르기" — 해당 칸을 현재 어느 칸에도 없는 질문으로 교체(없으면 무동작).
  function reroll(slotIndex: number) {
    setSlots((prev) => {
      const usedIds = new Set(prev.map((s) => s.questionId));
      const candidates = questions.filter((q) => !usedIds.has(q.id));
      if (candidates.length === 0) return prev; // 교체할 미사용 질문 없음.
      const next = candidates[randomIndex(candidates.length)];
      return prev.map((s, i) =>
        i === slotIndex ? { questionId: next.id, answer: s.answer } : s,
      );
    });
  }

  function setAnswer(slotIndex: number, value: string) {
    setSlots((prev) =>
      prev.map((s, i) => (i === slotIndex ? { ...s, answer: value } : s)),
    );
  }

  // 부모 보고 — slots 변경 시 { question_id, answer_text } 배열로 전달.
  //   onChange 는 부모가 매 렌더 새 함수일 수 있어 ref 로 고정(무한 루프 방지).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(
      slots.map((s) => ({ question_id: s.questionId, answer_text: s.answer })),
    );
  }, [slots]);

  // 풀이 비면 아무것도 렌더하지 않음(부모도 null 가드하지만 방어적으로).
  if (slots.length === 0) return null;

  // "다시 고르기" 활성 여부 — 현재 사용 중이 아닌 미사용 질문이 남아 있을 때만.
  const hasSpare = questions.length > slots.length;

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
        짧게 답해주세요
        <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
          선택 — 한두 문장이면 충분해요. 마음에 안 드는 질문은 바꿔도 돼요.
        </span>
      </label>
      <div className="space-y-3">
        {slots.map((slot, i) => (
          <SlotRow
            key={i}
            question={textById.get(slot.questionId) ?? ""}
            answer={slot.answer}
            canReroll={hasSpare && !disabled}
            onReroll={() => reroll(i)}
            onAnswer={(v) => setAnswer(i, v)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SlotRow — 단답 칸 1개. 질문 + 다시 고르기 + 답 textarea.
 * ───────────────────────────────────────────────────────────── */
function SlotRow({
  question,
  answer,
  canReroll,
  onReroll,
  onAnswer,
  disabled,
}: {
  question: string;
  answer: string;
  canReroll: boolean;
  onReroll: () => void;
  onAnswer: (v: string) => void;
  disabled?: boolean;
}) {
  const reroll = useCallback(() => onReroll(), [onReroll]);
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium leading-[1.5] text-[var(--text)]">
          {question}
        </p>
        {canReroll && (
          <button
            type="button"
            onClick={reroll}
            disabled={disabled}
            className="shrink-0 cursor-pointer whitespace-nowrap text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)] disabled:opacity-50"
          >
            다시 고르기
          </button>
        )}
      </div>
      <textarea
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        maxLength={ANSWER_MAX}
        rows={2}
        disabled={disabled}
        placeholder="자유롭게 적어주세요."
        className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-2.5 text-[14px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}

"use client";

/**
 * ShortAnswerFields — 단독 후기폼(/review/new)의 "단답 2칸".
 *
 * 형태(중첩 금지):
 *   기존 "생생한 후기" 단일 textarea 섹션(label + n/400 카운터 + placeholder)을 그대로
 *   재사용해 **평평하게 2칸**으로 노출한다. 카드 안 카드/글상자 안 글상자 같은 중첩 없음.
 *   각 칸 = [질문 라벨 + "다시 고르기" 버튼] + [기존과 동일한 textarea + n/400 카운터].
 *
 * 동작:
 *   - 부모가 전달한 질문 풀(question_pool 의 timepoint='any' AND is_active 후보 — "생생한 후기를
 *     남겨주세요" 포함)에서 마운트 시 2개 칸에 서로 다른 질문 1개씩 배정(두 칸 중복 방지).
 *     단, "생생한 후기를 남겨주세요"(대표 질문)가 풀에 있으면 첫 칸에 우선 배정해 옛 폼과 동일한
 *     첫인상을 유지(대표답=p_body 후보 안정화).
 *   - 각 칸: 셔플 아이콘(aria-label="다른 질문으로") → 현재 어느 칸에도 없는 "미사용 질문 중 랜덤"
 *     으로 교체(없으면 무동작). 순차(다음 인덱스)가 아닌 랜덤. 교체 시 라벨이 짧게 페이드(150ms).
 *   - 풀이 비면 컴포넌트 전체를 graceful 하게 렌더하지 않음(부모도 null 가드).
 *   - 풀이 1개뿐이면 칸 1개만 노출(두 칸 중복 방지 우선).
 *
 * 상태 보고:
 *   - onChange(answers) 로 현재 칸들의 { question_id, answer_text } 를 부모에 전달.
 *   - 빈 답 필터링은 부모(제출 직전)·RPC(short_answer_response INSERT)가 함께 수행하므로,
 *     본 컴포넌트는 칸 상태를 그대로 보고(빈 답도 포함). 부모가 trim 후 빈 항목을 제거.
 *
 * 랜덤은 클라이언트(Math.random) 허용 — 서버 렌더 일관성 불필요(작성 단계 입력 보조).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ONELINER_MAX, ONELINER_PLACEHOLDERS } from "./review-controls";

export type ShortAnswerQuestion = { id: number; text: string };
export type ShortAnswerValue = { question_id: number; answer_text: string };

/** 대표 질문(옛 "생생한 후기" 라벨) — 있으면 첫 칸 우선 배정·p_body 후보. */
export const REPRESENTATIVE_QUESTION_TEXT = "생생한 후기를 남겨주세요";

/** 글자수 상한 — 기존 "생생한 후기" textarea 와 동일(400, n/400 카운터). */
const ANSWER_MAX = ONELINER_MAX;

/** 슬롯 — 현재 질문 id + 답 텍스트 + 입력 힌트(placeholder). */
type Slot = { questionId: number; answer: string; placeholder: string };

/** 배열에서 무작위 1개 인덱스. */
function randomIndex(len: number): number {
  return Math.floor(Math.random() * len);
}

/** 격려 문구(placeholder) 풀에서 무작위 1개 — 가능하면 exclude 와 다른 것. */
function randomPlaceholder(exclude?: string): string {
  const pool = ONELINER_PLACEHOLDERS.filter((p) => p !== exclude);
  const arr = pool.length > 0 ? pool : ONELINER_PLACEHOLDERS;
  return arr[randomIndex(arr.length)];
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

  // 초기 슬롯: 서로 다른 질문 배정(마운트 1회 고정).
  //   대표 질문("생생한 후기")이 풀에 있으면 첫 칸에 우선, 나머지는 랜덤.
  const [slots, setSlots] = useState<Slot[]>(() => {
    if (questions.length === 0) return [];
    const pool = [...questions];
    const picked: Slot[] = [];
    let lastPh = "";
    const pushSlot = (questionId: number) => {
      const ph = randomPlaceholder(lastPh); // 칸마다 서로 다른 placeholder 우선.
      lastPh = ph;
      picked.push({ questionId, answer: "", placeholder: ph });
    };

    // 첫 칸 — 대표 질문 우선(있을 때).
    const repIdx = pool.findIndex((q) => q.text === REPRESENTATIVE_QUESTION_TEXT);
    if (repIdx >= 0) {
      pushSlot(pool[repIdx].id);
      pool.splice(repIdx, 1);
    }

    // 남은 칸 — 랜덤(두 칸 중복 방지).
    while (picked.length < slotCount && pool.length > 0) {
      const idx = randomIndex(pool.length);
      pushSlot(pool[idx].id);
      pool.splice(idx, 1);
    }
    return picked;
  });

  // 질문 교체 중 짧게 페이드아웃할 슬롯 인덱스 집합(부드러운 전환용).
  //   교체 직전 opacity 0 → 다음 프레임에 교체 + opacity 1 로 복귀(~150ms transition).
  const [fadingSlots, setFadingSlots] = useState<Set<number>>(() => new Set());
  // 페이드 타이머 정리용(언마운트 시 leak 방지).
  const fadeTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = fadeTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // 셔플(아이콘) — 해당 칸을 현재 어느 칸에도 없는 "미사용 질문 중 랜덤"으로 교체(없으면 무동작).
  //   부드러운 전환: 먼저 라벨을 페이드아웃(opacity 0)하고, 짧은 지연 뒤 질문을 바꾸며 페이드인.
  function reroll(slotIndex: number) {
    // 교체 가능한 미사용 질문이 없으면 페이드 없이 무동작.
    const usedIds = new Set(slots.map((s) => s.questionId));
    if (questions.filter((q) => !usedIds.has(q.id)).length === 0) return;

    // 1) 페이드아웃 시작.
    setFadingSlots((prev) => {
      const next = new Set(prev);
      next.add(slotIndex);
      return next;
    });

    // 2) 페이드 절반(120ms) 뒤 질문 교체 + 페이드인 — 딱딱한 즉시 교체 방지.
    const prevTimer = fadeTimers.current.get(slotIndex);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      setSlots((prev) => {
        const used = new Set(prev.map((s) => s.questionId));
        const candidates = questions.filter((q) => !used.has(q.id));
        if (candidates.length === 0) return prev; // 그새 후보가 사라졌으면 무동작.
        const nextQ = candidates[randomIndex(candidates.length)];
        return prev.map((s, i) =>
          i === slotIndex
            ? { ...s, questionId: nextQ.id, placeholder: randomPlaceholder(s.placeholder) }
            : s,
        );
      });
      setFadingSlots((prev) => {
        const next = new Set(prev);
        next.delete(slotIndex);
        return next;
      });
      fadeTimers.current.delete(slotIndex);
    }, 120);
    fadeTimers.current.set(slotIndex, timer);
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

  // 평평한 2칸 — 기존 "생생한 후기" textarea 섹션을 그대로 반복. 중첩 컨테이너 없음.
  return (
    <div className="space-y-5">
      {slots.map((slot, i) => (
        <div key={i}>
          <label className="mb-2 flex items-start justify-between gap-2 text-sm font-semibold text-[var(--text)]">
            {/* 질문 라벨 — 교체 시 짧게 페이드(opacity 150ms). 글자수 카운터는 함께 페이드. */}
            <span
              className={`transition-opacity duration-150 ease-out ${
                fadingSlots.has(i) ? "opacity-0" : "opacity-100"
              }`}
            >
              {textById.get(slot.questionId) ?? ""}{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                ({slot.answer.length} / {ANSWER_MAX})
              </span>
            </span>
            {hasSpare && (
              <button
                type="button"
                onClick={() => reroll(i)}
                disabled={disabled}
                aria-label="다른 질문으로"
                title="다른 질문으로"
                className="shrink-0 cursor-pointer rounded-full p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-50"
              >
                {/* 질문 교체(새로고침) 아이콘 — 부드러운 원형 화살표. 앱 인라인 SVG 규약. */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M21 2v6h-6" />
                  <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
                </svg>
              </button>
            )}
          </label>
          <textarea
            value={slot.answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            maxLength={ANSWER_MAX}
            rows={3}
            disabled={disabled}
            placeholder={slot.placeholder}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[14px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
          />
          {/* 첫 칸(대표 질문 자리)에만 의료광고·실명 고지 1회(옛 "생생한 후기" 안내 보존). */}
          {i === 0 && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              의료광고성 표현·병원·의사 실명 언급은 금합니다.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

"use client";

/**
 * CheckinForm — 시점별 체크인 입력 글상자 (P3, client).
 *
 * 알림 딥링크(/reviews/{id}/checkins?t={timepoint})로 진입해 day0 이후 후속 평가를 입력하는
 *   가벼운 폼. 추이 그래프는 만들지 않는다(입력 폼만).
 *
 * 항목(전부 선택 — 부분 입력 허용, RPC 롤업이 결론칸을 채움):
 *   1. 만족도 (별점 1~5)            → satisfaction
 *   2. 추천의향 (1/3/5)             → recommend
 *   3. 효과체감 (별점 1~5)          → effect_felt
 *   4. 달라진 점 (멀티 칩)          → changed_points (string[], ≤19, 각 ≤20자)
 *   ※ 통증(pain)은 day0 만 의미(0296 CHECK 상 딥링크 시점은 week1/month1/month4) → 미노출.
 *
 * 컨트롤은 review-controls.tsx 공용 모듈을 재사용(수정 없이 import 만). 톤·색은 ReviewForm 일관.
 *
 * 제출: POST /api/reviews/checkins → upsert_review_checkin RPC.
 *   body 계약(CheckinUpsertSchema): review_id / timepoint / satisfaction? / recommend? /
 *   effect_felt? / pain? / changed_points?. 본 폼은 pain 미전송(day0 전용).
 *   이미 입력한 시점이면 prefill 후 upsert(덮어쓰기). 성공 후 완료 안내 → /notes.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import {
  StarField,
  NumberChoiceField,
  EffectChip,
  RECOMMEND_OPTIONS,
  EFFECT_AREA_OPTIONS,
  EFFECT_AREA_COLORS,
  categoryColor,
} from "@/components/review/review-controls";
import ShortAnswerFields, {
  type ShortAnswerQuestion,
  type ShortAnswerValue,
} from "@/components/review/ShortAnswerFields";
import {
  TIMEPOINT_LABELS,
  type CheckinTimepoint,
  type CheckinPrefill,
} from "./checkin-shared";

type Props = {
  reviewId: number;
  timepoint: CheckinTimepoint;
  procedureKo: string | null;
  prefill: CheckinPrefill;
  /** 단답 질문 풀(이 시점 + 공통 'any', 활성). 비면 단답 2칸 숨김. */
  shortAnswerQuestions?: ShortAnswerQuestion[];
};

export default function CheckinForm({
  reviewId,
  timepoint,
  procedureKo,
  prefill,
  shortAnswerQuestions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tp = TIMEPOINT_LABELS[timepoint];

  /* ── 입력값(전부 선택, prefill 초기화) ── */
  const [satisfaction, setSatisfaction] = useState<number>(prefill.satisfaction ?? 0);
  const [recommend, setRecommend] = useState<number>(prefill.recommend ?? 0);
  const [effectFelt, setEffectFelt] = useState<number>(prefill.effectFelt ?? 0);
  const [changedPoints, setChangedPoints] = useState<string[]>(prefill.changedPoints ?? []);

  /* ── 단답(short answers) ──
     단답 컴포넌트가 보고하는 현재 칸 상태. 제출 시 trim 후 빈 답 제거하고 전송. */
  const [shortAnswers, setShortAnswers] = useState<ShortAnswerValue[]>([]);
  // 풀이 1개 이상일 때만 단답 블록 노출(비면 graceful 숨김).
  const showShortAnswers = (shortAnswerQuestions?.length ?? 0) > 0;
  // trim 후 빈 답 제거 — hasAnyInput·payload 양쪽에서 사용.
  const filledShortAnswers = showShortAnswers
    ? shortAnswers
        .map((a) => ({ question_id: a.question_id, answer_text: a.answer_text.trim() }))
        .filter((a) => a.answer_text.length > 0)
    : [];

  // 입력 변경 시 직전 에러 해제.
  useEffect(() => {
    setError(null);
  }, [satisfaction, recommend, effectFelt, changedPoints, shortAnswers]);

  function toggleChangedPoint(v: string) {
    setChangedPoints((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  // 최소 1개 항목은 입력해야 의미 있는 제출(빈 제출 차단). 단답만 채워도 유효.
  const hasAnyInput =
    satisfaction >= 1 ||
    recommend >= 1 ||
    effectFelt >= 1 ||
    changedPoints.length > 0 ||
    filledShortAnswers.length > 0;

  function submit() {
    setError(null);
    if (!hasAnyInput) {
      setError("한 가지 이상 남겨주세요.");
      return;
    }

    // CheckinUpsertSchema 계약 — 미입력(0)은 전송 생략(null 로 보내지 않음, 부분 입력 허용).
    const payload: {
      review_id: number;
      timepoint: CheckinTimepoint;
      satisfaction?: number;
      recommend?: number;
      effect_felt?: number;
      changed_points?: string[];
      short_answers?: { question_id: number; answer_text: string }[];
    } = { review_id: reviewId, timepoint };
    if (satisfaction >= 1) payload.satisfaction = satisfaction;
    if (recommend >= 1) payload.recommend = recommend;
    if (effectFelt >= 1) payload.effect_felt = effectFelt;
    if (changedPoints.length > 0) payload.changed_points = changedPoints;
    // 단답 — 채워진 항목이 있을 때만 전송(빈 항목·미존재 질문은 RPC 가 무시).
    if (filledShortAnswers.length > 0) payload.short_answers = filledShortAnswers;

    startTransition(async () => {
      try {
        const res = await fetch("/api/reviews/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
            userMessage?: string;
          } | null;
          setError(
            pickErrorMessage(
              { error: data?.error, message: data?.message ?? data?.userMessage },
              res.status,
            ),
          );
          return;
        }

        setDone(true);
        showToast("후속 후기를 남겨주셔서 감사합니다.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류가 발생했어요.");
      }
    });
  }

  /* ── 완료 화면 — 그래프 없이 안내 + 이동 버튼 ── */
  if (done) {
    return (
      <section className="mx-auto w-full max-w-[680px] py-6">
        <div className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center shadow-[var(--shadow-sm)]">
          <p className="text-[18px] font-bold leading-[1.5] text-[var(--text)]">
            {tp.short} 후기를 남겼어요!
          </p>
          <p className="text-sm leading-[1.6] text-[var(--text-secondary)]">
            기록해 주신 내용은 내 노트에서 다시 볼 수 있어요.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                router.push("/notes");
                router.refresh();
              }}
              className="h-10 cursor-pointer rounded-md bg-[var(--primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]"
            >
              내 노트로 가기
            </button>
          </div>
        </div>
      </section>
    );
  }

  const procColor = procedureKo ? categoryColor(procedureKo) : "var(--primary)";

  return (
    <section className="mx-auto w-full max-w-[680px] py-6">
      {/* 시점 맥락 헤더 — "○주/○달 지난 지금 어떠세요?" */}
      <h1 className="mb-1 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)] fade-in-up">
        {tp.elapsed} 지난 지금 어떠세요?
      </h1>
      {procedureKo && (
        <p className="mb-5 text-center text-sm font-semibold" style={{ color: procColor }}>
          {procedureKo}
        </p>
      )}
      {!procedureKo && <div className="mb-5" />}

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <p className="text-sm leading-[1.6] text-[var(--text-secondary)]">
          시간이 지나며 느낌이 달라졌을 수 있어요. 지금 기준으로 가볍게 남겨주세요.
          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
            모두 선택이에요 — 떠오르는 것만 골라도 괜찮아요.
          </span>
        </p>

        {/* 1. 만족도 */}
        <StarField label="지금 만족도" value={satisfaction} onChange={setSatisfaction} disabled={pending} />

        {/* 2. 추천의향 */}
        <NumberChoiceField
          label="다른 분께 추천하시겠어요?"
          value={recommend}
          onChange={setRecommend}
          options={RECOMMEND_OPTIONS}
          disabled={pending}
        />

        {/* 3. 효과체감 */}
        <StarField label="효과는 얼마나 느껴지세요?" value={effectFelt} onChange={setEffectFelt} disabled={pending} />

        {/* 4. 달라진 점 (멀티 칩) → changed_points */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
            지금 달라진 점을 모두 골라주세요
            <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
              처음과 비교해 새로 느껴지는 변화도 좋아요.
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            {EFFECT_AREA_OPTIONS.map((opt, i) => (
              <EffectChip
                key={opt}
                active={changedPoints.includes(opt)}
                color={EFFECT_AREA_COLORS[i % EFFECT_AREA_COLORS.length]}
                onClick={() => toggleChangedPoint(opt)}
                disabled={pending}
              >
                {opt}
              </EffectChip>
            ))}
          </div>
        </div>

        {/* 5. 단답 2칸 (선택) — 이 시점 + 공통 'any' 질문. 풀이 비면 컴포넌트가 렌더 안 함. */}
        {showShortAnswers && (
          <ShortAnswerFields
            questions={shortAnswerQuestions ?? []}
            onChange={setShortAnswers}
            disabled={pending}
          />
        )}

        {/* 서버/네트워크 에러 */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-center border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !hasAnyInput}
            className={`h-10 rounded-md px-8 text-sm font-semibold text-white transition-colors disabled:opacity-80 ${
              hasAnyInput
                ? "cursor-pointer bg-[var(--primary)] hover:bg-[var(--primary-dark)]"
                : "cursor-not-allowed bg-[#CBD2D9]"
            }`}
          >
            {pending ? "저장 중…" : "후기 남기기"}
          </button>
        </div>
      </div>
    </section>
  );
}

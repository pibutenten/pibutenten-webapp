/**
 * Reviews API payload schema (zod) — P3 시술후기 (2026-06-01)
 *
 * 목적:
 *   - 시술후기 전용 폼이 보내는 payload 의 타입·크기를 서버 진입점에서 검증.
 *   - 비정상 페이로드(거대한 body, 범위 밖 평점 등)가 RPC까지 도달하지 않도록 차단.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트(.strict())만 통과.
 *
 * 사용:
 *   const parsed = ReviewCreateSchema.safeParse(rawJson);
 *   if (!parsed.success) return errorResponse(parsed.error, "invalid_input", "...", 400);
 *   const payload = parsed.data;
 *
 * DB 측: RPC create_procedure_review 가 카드(type=review,category=review) +
 *   procedure_reviews 행을 원자적으로 생성. 본 스키마는 형식·크기만 검증하고,
 *   라우트가 추가로 시술명 존재·하드블록·소프트 검수·status 분기를 수행.
 */

import { z } from "zod";

/**
 * POST /api/reviews — 시술후기 생성
 *
 * 필수: procedure_ko, satisfaction, effect, pain, recovery_days, would_recommend.
 * 선택: area, cost_satisfaction, effect_areas, body, title.
 */
export const ReviewCreateSchema = z
  .object({
    // 시술명 (procedure_taxonomy.ko 와 매칭 — 라우트에서 존재 검증).
    procedure_ko: z.string().min(1).max(40),
    // 평점 3종 (1~5 정수, 필수).
    satisfaction: z.number().int().min(1).max(5),
    effect: z.number().int().min(1).max(5),
    pain: z.number().int().min(1).max(5),
    // 회복 기간 (일 단위, 0~365 정수, 필수).
    recovery_days: z.number().int().min(0).max(365),
    // 재추천 여부 (필수).
    would_recommend: z.boolean(),
    // 선택 항목.
    area: z.string().max(60).optional(),
    cost_satisfaction: z.number().int().min(1).max(5).optional(),
    effect_areas: z.array(z.string().min(1).max(20)).max(5).optional(),
    body: z.string().max(4000).optional(),
    title: z.string().max(200).optional(),
  })
  .strict();

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

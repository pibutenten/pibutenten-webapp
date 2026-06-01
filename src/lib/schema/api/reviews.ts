/**
 * Reviews API payload schema (zod) — P3 시술후기 (2026-06-01 단순화 명세)
 *
 * 목적:
 *   - 시술후기 전용 폼이 보내는 payload 의 타입·크기를 서버 진입점에서 검증.
 *   - 비정상 페이로드(거대한 body, 범위 밖 평점, 미정의 enum 등)가 RPC까지 도달하지 않도록 차단.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트(.strict())만 통과.
 *
 * 사용:
 *   const parsed = ReviewCreateSchema.safeParse(rawJson);
 *   if (!parsed.success) return errorResponse(parsed.error, "invalid_input", "...", 400);
 *   const payload = parsed.data;
 *
 * DB 측: RPC create_procedure_review 가 카드(type=review,category=review) +
 *   procedure_reviews 행을 원자적으로 생성. 본 스키마는 형식·크기·enum 만 검증하고,
 *   라우트가 추가로 시술명 존재·블라인드 마스킹·소프트 검수·status 분기를 수행.
 *
 * 값 키는 DB CHECK constraint 와 정확히 일치해야 함 (CLAUDE.md 동기화 페어).
 */

import { z } from "zod";

/**
 * POST /api/reviews — 시술후기 생성
 *
 * 최종 폼 항목 (전부 필수):
 *   procedure_ko / satisfaction(1~5) / pain(1~5) / revisit(예·고민중·아니오) /
 *   effect_areas(체감 효과 멀티, ≥1) / body(한줄후기 ≤150, 비어있으면 안 됨).
 * 선택: title (기본값 생성용).
 *
 * 2026-06-01 단순화: downtime/sessions/timing/cost_satisfaction/
 *   concurrent_procedures/adverse_reactions/oneliner_type 전부 제거.
 */
export const ReviewCreateSchema = z
  .object({
    // 시술명 (procedure_taxonomy.ko 와 매칭 — 라우트에서 존재 검증).
    procedure_ko: z.string().min(1).max(40),

    // ── 필수 평점·척도 ──
    satisfaction: z.number().int().min(1).max(5),
    pain: z.number().int().min(1).max(5),
    // 재시술 의향: 예 / 고민중 / 아니오.
    revisit: z.enum(["yes", "maybe", "no"]),
    // 체감 효과 — SKIN_CONCERNS 라벨(동안/피부장벽 치환), 복수(1~10개, 각 ≤20자).
    effect_areas: z.array(z.string().min(1).max(20)).min(1).max(10),
    // 한줄후기 본문 (body 컬럼에 저장, 1~150자 — 비어있으면 안 됨).
    body: z.string().min(1).max(150),

    // ── 선택 ──
    // title 기본값 생성용 (라우트에서 미지정 시 `{시술명} 시술후기`).
    title: z.string().max(200).optional(),
  })
  .strict();

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

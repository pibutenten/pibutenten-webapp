/**
 * Reviews API payload schema (zod) — P3 시술후기 (2026-06-01 확정 명세 개편)
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
 * 필수: procedure_ko, satisfaction, pain, downtime, sessions, timing, revisit.
 * 선택: cost_satisfaction, effect_areas, concurrent_procedures, adverse_reactions,
 *       oneliner_type, body(한줄후기 ≤150), title.
 *
 * 2026-06-01 개편: recovery_days·area·would_recommend·effect 제거.
 *   다운타임/회차/시점/재시술 의향을 enum 척도로 신설.
 */
export const ReviewCreateSchema = z
  .object({
    // 시술명 (procedure_taxonomy.ko 와 매칭 — 라우트에서 존재 검증).
    procedure_ko: z.string().min(1).max(40),

    // ── 필수 평점·척도 ──
    satisfaction: z.number().int().min(1).max(5),
    pain: z.number().int().min(1).max(5),
    // 다운타임: 없음 / 1~2일 / 3~5일 / 1주+.
    downtime: z.enum(["none", "d1_2", "d3_5", "w1plus"]),
    // 회차: 1회 / 2~3회 / 4회+.
    sessions: z.enum(["s1", "s2_3", "s4plus"]),
    // 받은 시점: 2주 내 / 1~3개월 / 3개월+.
    timing: z.enum(["w2", "m1_3", "m3plus"]),
    // 재시술 의향: 예 / 고민중 / 아니오.
    revisit: z.enum(["yes", "maybe", "no"]),

    // ── 선택 ──
    // 가성비 (1~5 정수).
    cost_satisfaction: z.number().int().min(1).max(5).optional(),
    // 효과 체감 부위 — SKIN_CONCERNS 라벨(동안/피부장벽 치환), 복수(≤10개, 각 ≤20자).
    effect_areas: z.array(z.string().min(1).max(20)).max(10).optional(),
    // 병행 시술 — procedure_ko 값들(현재 선택 시술 제외), 복수(≤10개, 각 ≤40자).
    concurrent_procedures: z.array(z.string().min(1).max(40)).max(10).optional(),
    // 이상반응 — 없음/멍/붓기/색소/기타. 복수(≤5), none 단독은 폼에서 보장.
    adverse_reactions: z
      .array(z.enum(["none", "bruise", "swelling", "pigment", "etc"]))
      .max(5)
      .optional(),
    // 한줄후기 유형 — 추천 / 받기 전 팁 / 기타.
    oneliner_type: z.enum(["recommend", "caution", "etc"]).optional(),
    // 한줄후기 본문 (body 컬럼에 저장, ≤150).
    body: z.string().max(150).optional(),
    title: z.string().max(200).optional(),
  })
  .strict();

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

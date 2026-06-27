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
 * 최종 폼 항목:
 *   procedure_ko / satisfaction(1~5) / pain(1~5) / downtime(5슬러그) /
 *   revisit(예·고민중·아니오) / effect_areas(체감 효과 멀티, ≥1, '없음' 포함) /
 *   effect_onset(5슬러그) — 전부 필수. body(생생한 후기 ≤400)만 선택.
 * 선택: title (기본값 생성용).
 *
 * 2026-06-XX 폼 확장(2a): downtime/effect_onset 신규(영문 슬러그, DB CHECK 와 일치).
 *   effect_areas min 1(효과 필수, '없음' 칩 포함) · max 19(18종+없음).
 */
export const ReviewCreateSchema = z
  .object({
    // 시술명 (tag_dictionary(is_procedure=true).ko 와 매칭 — 라우트에서 존재 검증).
    procedure_ko: z.string().min(1).max(40),

    // ── 필수 평점·척도 ──
    satisfaction: z.number().int().min(1).max(5),
    pain: z.number().int().min(1).max(5),
    // 다운타임(일상 복귀 소요) — 영문 슬러그(DB downtime_chk 와 일치).
    downtime: z.enum(["same_day", "days_1_2", "days_3_5", "week_1", "weeks_2_plus"]),
    // 재시술 의향: 예 / 고민중 / 아니오.
    revisit: z.enum(["yes", "maybe", "no"]),
    // 추천의향(recommend) — 다른 분께 권할지(1~5 척도). revisit 와 의미 다름.
    //   visit 경로(VisitReviewSchema.recommend)와 정합되도록 1~5 정수, optional·nullable.
    //   미전달 시 DB recommend = NULL(기존 후기 무회귀).
    recommend: z.number().int().min(1).max(5).nullable().optional(),
    // 체감 효과 — 후기 전용 19종 라벨('없음' 포함), 필수(1~19개, 각 ≤20자).
    effect_areas: z.array(z.string().min(1).max(20)).min(1).max(19),
    // 효과 체감 시기 — 영문 슬러그(DB effect_onset_chk 와 일치).
    effect_onset: z.enum(["immediate", "weeks_1_2", "month_1", "months_2_3", "still_watching"]),
    // 생생한 후기 본문 (body 컬럼, 선택 — 0~400자). 비어 있으면 제목만 저장.
    body: z.string().max(400),

    // ── 선택 ──
    // title 기본값 생성용 (라우트에서 미지정 시 `{시술명} 시술후기`).
    title: z.string().max(200).optional(),
  })
  .strict();

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

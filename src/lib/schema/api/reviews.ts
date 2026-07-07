/**
 * Reviews API payload schema (zod) — P3 시술후기 (2026-06-01 단순화 명세)
 *
 * 목적:
 *   - 시술후기 전용 폼이 보내는 payload 의 타입·크기를 서버 진입점에서 검증.
 *   - 비정상 페이로드(거대한 body, 범위 밖 평점, 미정의 enum 등)가 RPC까지 도달하지 않도록 차단.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트(.strict())만 통과.
 *
 * 사용:
 *   const parsed = ReviewCreateSchema.safeParse(rawJson);   // POST(작성)
 *   const parsed = ReviewEditSchema.safeParse(rawJson);     // PATCH(수정)
 *   if (!parsed.success) return errorResponse(parsed.error, "invalid_input", "...", 400);
 *   const payload = parsed.data;
 *
 * DB 측: RPC create_procedure_review 가 카드(type=review,category=review) +
 *   procedure_reviews 행을 원자적으로 생성. 본 스키마는 형식·크기·enum 만 검증하고,
 *   라우트가 추가로 시술명 존재·블라인드 마스킹·소프트 검수·status 분기를 수행.
 *
 * 값 키는 DB CHECK constraint 와 정확히 일치해야 함 (CLAUDE.md 동기화 페어).
 *
 * 스키마 이원화(2026-07-07): 노트↔후기 연결 필드(visit_id/diary_procedure_id, 마이그 0354)는
 *   **작성(POST) 경로 전용**이라 코어에서 분리했다. ReviewEditSchema(PATCH)는 코어만 받으며
 *   .strict() 로 연결 필드를 차단(edit 경로에 방문 연결이 새어들지 않도록 — 코드검수 반영).
 */

import { z } from "zod";
import { REACTION_ALL } from "@/lib/review-options";

/**
 * 후기 코어 필드 — 작성(POST)·수정(PATCH) 공유.
 *
 * 최종 폼 항목:
 *   procedure_ko / satisfaction(1~5) / pain(1~5) / downtime(5슬러그) /
 *   revisit(예·고민중·아니오) / effect_areas(체감 효과 멀티, ≥1, '없음' 포함) /
 *   effect_onset(5슬러그) — 전부 필수. body(생생한 후기 ≤400)만 선택.
 */
const reviewCoreShape = {
  // 시술명 (tag_dictionary(is_procedure=true).ko 와 매칭 — 라우트에서 존재 검증).
  procedure_ko: z.string().min(1).max(40),

  // ── 필수 평점·척도 ──
  satisfaction: z.number().int().min(1).max(5),
  pain: z.number().int().min(1).max(5),
  // 다운타임(일상 복귀 소요) — 영문 슬러그(DB downtime_chk 와 일치). 선택(당일 작성 시 미정).
  downtime: z.enum(["same_day", "days_1_2", "days_3_5", "week_1", "weeks_2_plus"]).nullish(),
  // 재시술 의향: 예 / 고민중 / 아니오.
  revisit: z.enum(["yes", "maybe", "no"]),
  // 추천의향(recommend) — 1~5 척도, optional·nullable(미전달 시 NULL).
  recommend: z.number().int().min(1).max(5).nullable().optional(),
  // 체감 효과 — 후기 전용 19종 라벨('없음' 포함), 필수(1~19개, 각 ≤20자).
  effect_areas: z.array(z.string().min(1).max(20)).min(1).max(19),
  // 시술 직후 반응(reactions) — 멀티칩(6종 + '없음'), 선택. 비면 빈 배열(=없음).
  reactions: z.array(z.enum(REACTION_ALL)).max(7).optional().default([]),
  // 효과 체감 시기 — 영문 슬러그(DB effect_onset_chk 와 일치).
  effect_onset: z.enum(["immediate", "weeks_1_2", "month_1", "months_2_3", "still_watching"]).optional(),
  // 생생한 후기 본문 (body 컬럼, 선택 — 0~400자).
  body: z.string().max(400),

  // ── 어림시기(언제 받으셨어요?) — 마이그 0308 ──
  //   date_precision 미전달이면 'exact'. create 경로에서만 의미(PATCH 는 미전달=검증 건너뜀).
  date_precision: z.enum(["exact", "season", "half", "year", "unknown"]).optional(),
  visited_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
    .nullable()
    .optional(),

  // 단답(short answers) — 최대 2개. 빈 답은 RPC 가 무시.
  short_answers: z
    .array(
      z
        .object({
          question_id: z.number().int().positive(),
          answer_text: z.string().max(400),
        })
        .strict(),
    )
    .max(2)
    .optional(),

  // title 기본값 생성용 (라우트에서 미지정 시 `{시술명} 시술후기`).
  title: z.string().max(200).optional(),
};

/**
 * 어림시기 검증 — create/edit 공통. date_precision 을 "명시 전달"한 경우(=create 폼)에만 적용.
 *   unknown(날짜 미기억) 이 아니면 visited_on(대표일, YYYY-MM-DD) 필수. PATCH 는 미전달 → 건너뜀(무회귀).
 */
function refineVisitedOn(
  v: { date_precision?: string; visited_on?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (v.date_precision === undefined) return;
  if (v.date_precision !== "unknown" && (v.visited_on === undefined || v.visited_on === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visited_on"],
      message: "어림시기를 선택해주세요.",
    });
  }
}

/**
 * PATCH /api/reviews/{shortcode} — 시술후기 수정. 코어만 수용.
 *   .strict() 로 visit_id/diary_procedure_id(작성 전용 연결 필드) 차단 — edit 경로 누출 방지.
 */
export const ReviewEditSchema = z.object(reviewCoreShape).strict().superRefine(refineVisitedOn);
export type ReviewEditPayload = z.infer<typeof ReviewEditSchema>;

/**
 * POST /api/reviews — 시술후기 생성. 코어 + 노트↔후기 연결(2b, 마이그 0354).
 *   회원 시술노트(방문) 상세의 '시술후기 쓰기'로 진입한 경우에만 채워짐.
 *   visit_id: 그 방문(diaries.id). RPC 가 소유·정합 검증 후 source='diary_linked'+visit_id 저장.
 *   diary_procedure_id: 그 방문 안의 특정 시술(diary_procedures.id). '이 시술에 이미 썼는지'를
 *     FK 로만 판정하기 위한 앵커(procedure_ko 텍스트매칭 금지). 미전달/NULL 이면 standalone(무회귀).
 */
export const ReviewCreateSchema = z
  .object({
    ...reviewCoreShape,
    visit_id: z.number().int().positive().nullable().optional(),
    diary_procedure_id: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    refineVisitedOn(v, ctx);
    // 방문·시술은 함께 지정해야 한다(노트 링크는 항상 visit=&dp= 동반). 한쪽만 오면 친절한 400
    //   — RPC 내부 예외(invalid_diary_procedure) 대신 진입점에서 차단(코드검수 반영).
    const hasVisit = v.visit_id != null;
    const hasDp = v.diary_procedure_id != null;
    if (hasVisit !== hasDp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasVisit ? "diary_procedure_id" : "visit_id"],
        message: "방문과 시술을 함께 지정해야 합니다.",
      });
    }
  });

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

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

    // ── 어림시기(언제 받으셨어요?) — 단독 후기 전용(2026-06-27, 마이그 0308) ──
    //   date_precision: 정확도(exact/season/half/year/unknown). DB CHECK·SkinDiaryForms 와 일치.
    //     미전달이면 'exact'(기존 하드코딩 호환). create 경로에서만 의미(PATCH 는 무시).
    //   visited_on: 어림시기 대표일(YYYY-MM-DD). unknown(날짜 미기억)이면 생략/NULL.
    //     superRefine: precision !== 'unknown' 이면 visited_on(YYYY-MM-DD) 필수.
    date_precision: z
      .enum(["exact", "season", "half", "year", "unknown"])
      .optional(),
    visited_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
      .nullable()
      .optional(),

    // 단답(short answers) — 단독 후기폼의 "단답 2칸". 선택(미전달 가능).
    //   각 항목 { question_id(양의 정수), answer_text(≤400자) }. 최대 2개(폼이 2칸).
    //   answer_text 상한은 body(생생한 후기 ≤400)·visits.ts 와 일관(단답 2칸이 후기 본체).
    //   답이 빈 항목은 RPC 가 무시(저장 제외)하므로 클라가 보내도 무해.
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

    // ── 선택 ──
    // title 기본값 생성용 (라우트에서 미지정 시 `{시술명} 시술후기`).
    title: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // 어림시기 검증은 date_precision 을 "명시 전달"한 경우(=create 폼)에만 적용.
    //   - create(POST): ReviewForm 이 date_precision 을 항상 전송 → 아래 규칙 적용.
    //   - edit(PATCH): 어림시기 블록을 숨기므로 date_precision 미전달(undefined) → 검증 건너뜀(무회귀).
    //   규칙: unknown(날짜 미기억) 이 아니면 visited_on(대표일, YYYY-MM-DD) 필수.
    if (v.date_precision === undefined) return;
    if (v.date_precision !== "unknown" && (v.visited_on === undefined || v.visited_on === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visited_on"],
        message: "어림시기를 선택해주세요.",
      });
    }
  });

export type ReviewCreatePayload = z.infer<typeof ReviewCreateSchema>;

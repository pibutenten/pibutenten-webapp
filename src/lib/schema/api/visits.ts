/**
 * Visits API payload schemas (zod) — 후기·시술일기 통합 Phase 3a.
 *
 * 목적:
 *   - 통합 작성(/api/visits POST), visit 수정(/api/visits/{id} PATCH),
 *     시계열 체크인(/api/reviews/checkins POST) payload 의 타입·크기를 진입점에서 검증.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트(.strict())만 통과.
 *   - 값 키는 DB CHECK constraint / RPC 0297 시그니처와 정확히 일치해야 함 (CLAUDE.md 동기화 페어).
 *
 * DB 측: RPC create_visit_with_entries / update_visit / upsert_review_checkin (0297, dormant)
 *   가 원자적으로 INSERT/UPDATE. 본 스키마는 형식·크기·enum 만 검증하고, 라우트가 추가로
 *   시술명 존재·블라인드 마스킹·소프트 검수·status 분기·revalidate 를 수행.
 *
 * F3(2026-06-27): diary_linked 공개 후기 허용 — VisitReviewSchema.is_public 은 boolean.
 *   is_public=true 면 라우트가 마스킹·검수·shortcode 생성 후 card 를 주입해 RPC 가 카드/앵커 생성.
 */

import { z } from "zod";

/** YYYY-MM-DD 형식 + 실재 날짜 검증 (DiaryCreateSchema 와 동일 패턴). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .refine((v) => {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "유효하지 않은 날짜");

/** 시술 행 — DiaryCreateSchema.ProcedureSchema 계승(시술노트 자료구조 무변경). */
const ProcedureSchema = z
  .object({
    procedure_ko: z.string().trim().min(1).max(100),
    // tag_dict_ko 는 클라가 보내지 않음(서버가 tag_dictionary 매칭해 채움 — FK 위반 방지).
    unit_text: z.string().trim().max(100).nullable().optional(),
    price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

/**
 * day0 체크인 — review_checkin(timepoint='day0') 측정값(통합 작성 시 인라인).
 *   결론 칸과 달리 시계열 day0 는 전부 선택(부분 입력 허용 — 롤업으로 채워짐).
 */
const CheckinDay0Schema = z
  .object({
    satisfaction: z.number().int().min(1).max(5).nullable().optional(),
    recommend: z.number().int().min(1).max(5).nullable().optional(),
    effect_felt: z.number().int().min(1).max(5).nullable().optional(),
    pain: z.number().int().min(1).max(5).nullable().optional(),
    changed_points: z.array(z.string().min(1).max(20)).max(19).nullable().optional(),
  })
  .strict();

/**
 * 공개 후기 카드 메타 — is_public=true 인 후기에만 동반.
 *   라우트가 마스킹·검수·shortcode 생성 후 채운다(클라가 직접 보내지 않음 — 라우트가 재구성).
 */
const VisitReviewCardSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().max(400),
    keywords: z.array(z.string().min(1).max(40)).min(1).max(20),
    status: z.enum(["published", "pending_review"]),
    shortcode: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{6,12}$/),
    post_year: z.number().int().min(2000).max(2100),
  })
  .strict();

/**
 * 통합 작성 후기 1건 — diary_linked.
 *   결론 칸(satisfaction/pain/...)은 diary_linked 시계열이라 부분 입력 가능(nullable).
 *   standalone 결론칸 필수성은 /api/reviews(create_procedure_review) 경로가 별도로 강제.
 */
const VisitReviewSchema = z
  .object({
    // 펼친 시술 행의 0-based 인덱스 → RPC 가 diary_procedure_id 로 매핑(+1 보정은 RPC 내부).
    diary_procedure_index: z.number().int().min(0).max(19).nullable().optional(),
    procedure_ko: z.string().trim().min(1).max(100),
    // F3: diary_linked 공개 허용. true 면 라우트가 card 를 채워 보냄.
    is_public: z.boolean().default(false),
    // 결론 칸 — diary_linked 는 부분 입력 가능.
    satisfaction: z.number().int().min(1).max(5).nullable().optional(),
    pain: z.number().int().min(1).max(5).nullable().optional(),
    revisit: z.enum(["yes", "maybe", "no"]).nullable().optional(),
    effect_areas: z.array(z.string().min(1).max(20)).max(19).nullable().optional(),
    downtime: z
      .enum(["same_day", "days_1_2", "days_3_5", "week_1", "weeks_2_plus"])
      .nullable()
      .optional(),
    effect_onset: z
      .enum(["immediate", "weeks_1_2", "month_1", "months_2_3", "still_watching"])
      .nullable()
      .optional(),
    recommend: z.number().int().min(1).max(5).nullable().optional(),
    // 비공개 격리 — 시술별 가격(공개 경로로 복사되지 않음).
    solo_price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    date_precision: z.enum(["exact", "season", "half", "year", "unknown"]).nullable().optional(),
    // 공개(is_public=true) 후기 본문 — 마스킹/검수 후 라우트가 재구성해 보냄(클라 입력 아님).
    body: z.string().max(400).nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    keywords: z.array(z.string().min(1).max(40)).max(20).nullable().optional(),
    checkin_day0: CheckinDay0Schema.nullable().optional(),
  })
  .strict();

/**
 * POST /api/visits — 통합 작성(visit + 시술목록 + 후기 + day0).
 *   DiaryCreateSchema 확장 + visited_on_precision / clinic_home·kakao / total_price /
 *   is_complete / reviews.
 */
export const VisitCreateSchema = z
  .object({
    // 회고형 관대화: precision='unknown'("날짜 잘 기억 안 나요") 면 visited_on 을 null/미전송 허용.
    //   그 외 precision 은 visited_on 필수 — 아래 .superRefine 으로 교차 검증.
    visited_on: isoDate.nullable().optional(),
    visited_on_precision: z.enum(["exact", "season", "half", "year", "unknown"]).default("exact"),
    clinic_id: z.number().int().positive().nullable().optional(),
    clinic_name: z.string().trim().max(200).nullable().optional(),
    clinic_addr: z.string().trim().max(300).nullable().optional(),
    clinic_tel: z.string().trim().max(50).nullable().optional(),
    clinic_x: z.number().finite().nullable().optional(),
    clinic_y: z.number().finite().nullable().optional(),
    clinic_home: z.string().trim().max(300).nullable().optional(),
    clinic_kakao: z.string().trim().max(300).nullable().optional(),
    doctor_name: z.string().trim().max(100).nullable().optional(),
    manager_name: z.string().trim().max(100).nullable().optional(),
    diary_body: z.string().max(400).nullable().optional(),
    total_price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    is_complete: z.boolean().default(true),
    // is_complete=false(미완성 임시저장) 면 시술 0개 허용(D-C). RPC 가 면제 가드.
    procedures: z.array(ProcedureSchema).max(20).default([]),
    reviews: z.array(VisitReviewSchema).max(20).default([]),
  })
  .strict()
  // 교차 검증: precision='unknown' 이 아니면 visited_on(YYYY-MM-DD) 필수.
  //   unknown 이면 visited_on 은 null/미전송 허용(백엔드가 NULL 처리 + 재방문 알림 미예약).
  .superRefine((v, ctx) => {
    if (v.visited_on_precision !== "unknown" && !v.visited_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visited_on"],
        message: "방문 날짜가 필요합니다.",
      });
    }
  });

/**
 * PATCH /api/visits/{id} — visit 본문 전체 덮어쓰기.
 *   폼이 항상 전체 값을 전송하는 정책(전체 덮어쓰기, §3.4). 후기·시술 목록은 미수정(v1, D-J).
 */
export const VisitUpdateSchema = z
  .object({
    // 회고형 관대화(create 와 동일 계약): precision='unknown' 이면 visited_on null/미전송 허용.
    visited_on: isoDate.nullable().optional(),
    visited_on_precision: z.enum(["exact", "season", "half", "year", "unknown"]).default("exact"),
    clinic_id: z.number().int().positive().nullable().optional(),
    clinic_name: z.string().trim().max(200).nullable().optional(),
    clinic_addr: z.string().trim().max(300).nullable().optional(),
    clinic_tel: z.string().trim().max(50).nullable().optional(),
    clinic_x: z.number().finite().nullable().optional(),
    clinic_y: z.number().finite().nullable().optional(),
    clinic_home: z.string().trim().max(300).nullable().optional(),
    clinic_kakao: z.string().trim().max(300).nullable().optional(),
    doctor_name: z.string().trim().max(100).nullable().optional(),
    manager_name: z.string().trim().max(100).nullable().optional(),
    diary_body: z.string().max(400).nullable().optional(),
    total_price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    is_complete: z.boolean().default(true),
  })
  .strict()
  // create 와 동일: precision='unknown' 이 아니면 visited_on 필수.
  .superRefine((v, ctx) => {
    if (v.visited_on_precision !== "unknown" && !v.visited_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visited_on"],
        message: "방문 날짜가 필요합니다.",
      });
    }
  });

/**
 * POST /api/reviews/checkins — 시계열 체크인 upsert(day0/week1/month1/month4).
 *   day0 만 통증(pain) 의미. 부분 입력 허용(롤업으로 결론칸 채움).
 */
export const CheckinUpsertSchema = z
  .object({
    review_id: z.number().int().positive(),
    timepoint: z.enum(["day0", "week1", "month1", "month4"]),
    satisfaction: z.number().int().min(1).max(5).nullable().optional(),
    recommend: z.number().int().min(1).max(5).nullable().optional(),
    effect_felt: z.number().int().min(1).max(5).nullable().optional(),
    pain: z.number().int().min(1).max(5).nullable().optional(),
    changed_points: z.array(z.string().min(1).max(20)).max(19).nullable().optional(),
    // 단답(short answers) — 체크인 폼의 "단답 2칸"(시점별 질문 + 공통 'any'). 선택(미전달 가능).
    //   각 항목 { question_id(양의 정수), answer_text(≤400자) }. 최대 2개(폼이 2칸).
    //   answer_text 상한은 reviews.ts 단답·body(≤400)와 일관(단답 = 후기 본체).
    //   답이 빈 항목·미존재 질문은 RPC 가 무시(저장 제외)하므로 클라가 보내도 무해.
    //   RPC 가 이 체크인의 checkin_id 와 함께 short_answer_response 에 INSERT.
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
  })
  .strict();

export type VisitCreatePayload = z.infer<typeof VisitCreateSchema>;
export type VisitUpdatePayload = z.infer<typeof VisitUpdateSchema>;
export type CheckinUpsertPayload = z.infer<typeof CheckinUpsertSchema>;

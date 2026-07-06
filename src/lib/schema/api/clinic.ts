/**
 * Clinic API payload schemas (zod) — 병원 계정 시술노트 대행 B3.
 *
 * 목적:
 *   - /api/clinic/* (병원측) · /api/member/clinic-links/* (회원측) payload 를 진입점에서 검증.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트(.strict())만 통과.
 *   - 길이·범위 상한은 RPC 0345 의 서버 검증과 동일 값(이중 방어 — RPC 가 최종 방어선).
 *
 * DB 측: clinic_request_link / clinic_update_patient / clinic_add_visit /
 *   member_respond_link / member_revoke_clinic_link (0345) 가 명함 소유·연결 상태·
 *   rate limit(지점 단위)·잔여 검증을 SECURITY DEFINER 내부에서 수행.
 */

import { z } from "zod";
import { isoDate } from "./visits";

/**
 * POST /api/clinic/links — 병원: 회원 등록(연결) 요청.
 *   handle+생일 하드키 대조는 RPC(clinic_request_link) 내부 — 실패 사유 비구분(열거 방지).
 */
export const ClinicLinkRequestSchema = z
  .object({
    handle: z.string().trim().min(1).max(30),
    legal_name: z.string().trim().min(1).max(50),
    birthdate: isoDate,
    registration_number: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/clinic/patients/{linkId} — 병원: 환자 기록 수정.
 *
 * ⚠️ 전체 교체 방식(clinic_update_patient 계약): 생략(미전송)·null 필드는 DB 에서 NULL 로
 *   지워진다. 클라이언트 폼은 항상 **전체 필드 값**을 전송해야 함(부분 PATCH 아님).
 */
export const ClinicPatientUpdateSchema = z
  .object({
    registration_number: z.string().trim().max(100).nullable().optional(),
    patient_phone: z.string().trim().max(50).nullable().optional(),
    patient_address: z.string().trim().max(200).nullable().optional(),
    patient_name: z.string().trim().max(50).nullable().optional(),
    patient_birthdate: isoDate.nullable().optional(),
    patient_email: z.string().trim().max(320).nullable().optional(),
    // jsonb 통짜 저장(RPC 무가공) — 구조는 회원 스냅샷과 동일 키를 폼이 유지.
    //   직렬화 4000자 상한으로 비대 payload 방어(DB 컬럼은 상한 없음).
    patient_skin_profile: z
      .record(z.unknown())
      .refine((v) => JSON.stringify(v).length <= 4000, "피부 프로필이 너무 큽니다.")
      .nullable()
      .optional(),
  })
  .strict();

/** 시술 행 — visits.ts ProcedureSchema 계승 + tag_dict_ko/sort_order(병원 폼이 직접 지정). */
const ClinicVisitProcedureSchema = z
  .object({
    procedure_ko: z.string().trim().min(1).max(100),
    // 사전 미등록 태그는 RPC 가 NULL 처리(FK 위반 방지) — 라우트 선매칭 불필요.
    tag_dict_ko: z.string().trim().max(100).nullable().optional(),
    unit_text: z.string().trim().max(100).nullable().optional(),
    price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    sort_order: z.number().int().min(0).max(19).nullable().optional(),
  })
  .strict();

/**
 * POST /api/clinic/visits — 병원: 시술노트 대행 작성(clinic_add_visit).
 *   visited_on_precision 은 RPC 가 'exact' 고정(병원은 시술 당일 실기록 기준).
 *   next_appointment_date >= visited_on 검증은 RPC 내부(invalid_next_appointment_date → 400).
 */
export const ClinicVisitCreateSchema = z
  .object({
    link_id: z.number().int().positive(),
    visited_on: isoDate,
    procedures: z.array(ClinicVisitProcedureSchema).min(1).max(20),
    doctor_id: z.string().uuid().nullable().optional(),
    doctor_name: z.string().trim().max(100).nullable().optional(),
    manager_name: z.string().trim().max(100).nullable().optional(),
    diary_body: z.string().max(400).nullable().optional(),
    total_price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    next_appointment_date: isoDate.nullable().optional(),
  })
  .strict();

/**
 * POST /api/member/clinic-links/{linkId}/respond — 회원: 동의/거절.
 *   backfill_legal_name=true 면 병원 입력 실명을 내 프로필 legal_name 에 저장
 *   (비어있을 때만 — RPC 내부 가드).
 */
export const MemberLinkRespondSchema = z
  .object({
    consent: z.boolean(),
    backfill_legal_name: z.boolean().optional(),
  })
  .strict();

export type ClinicLinkRequestPayload = z.infer<typeof ClinicLinkRequestSchema>;
export type ClinicPatientUpdatePayload = z.infer<typeof ClinicPatientUpdateSchema>;
export type ClinicVisitCreatePayload = z.infer<typeof ClinicVisitCreateSchema>;
export type MemberLinkRespondPayload = z.infer<typeof MemberLinkRespondSchema>;

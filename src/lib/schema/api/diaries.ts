import { z } from "zod";

/**
 * 시술일기(diaries) 생성 페이로드 검증 — /api/diaries POST.
 *   비공개 개인 데이터. create_diary RPC(0279) 가 DB CHECK 와 이중 검증하지만,
 *   API 경계에서 형식·크기 화이트리스트로 1차 차단.
 */
const ProcedureSchema = z.object({
  procedure_ko: z.string().trim().min(1).max(100),
  // tag_dict_ko 는 클라가 보내지 않음(서버가 tag_dictionary 매칭해 채움 — FK 위반 방지).
  unit_text: z.string().trim().max(100).nullable().optional(),
  price: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const DiaryCreateSchema = z.object({
  visited_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    // 형식만 맞고 존재하지 않는 날짜(2026-13-99)는 RPC date 파싱에서 500 → 여기서 실재 날짜 검증.
    .refine((v) => {
      const [y, m, d] = v.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }, "유효하지 않은 날짜"),
  clinic_id: z.number().int().positive().nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  clinic_addr: z.string().trim().max(300).nullable().optional(),
  clinic_tel: z.string().trim().max(50).nullable().optional(),
  clinic_x: z.number().finite().nullable().optional(),
  clinic_y: z.number().finite().nullable().optional(),
  doctor_name: z.string().trim().max(100).nullable().optional(),
  manager_name: z.string().trim().max(100).nullable().optional(),
  diary_body: z.string().max(400).nullable().optional(),
  procedures: z.array(ProcedureSchema).min(1).max(20),
});

export type DiaryCreatePayload = z.infer<typeof DiaryCreateSchema>;

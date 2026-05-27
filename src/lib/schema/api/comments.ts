/**
 * /api/comments Zod 스키마 (2026-05-28 신설).
 *
 * 도입 배경: 기존 라우트는 typeof 수동 검증 (parseInt + trim + length 등) 으로
 *   articles 의 Zod 검증 패턴과 정합이 안 맞았다. 동일 패턴으로 통합하여:
 *   - 입력 검증 표면 일관화 (`.strict()` — 알 수 없는 키 차단)
 *   - 에러 응답 형식 통일 (errorResponse devOnly.issues)
 *   - 향후 필드 추가 시 단일 출처 갱신
 *
 * 라우트는 추가로 권한·rate-limit·RLS 의존을 그대로 수행.
 *
 * 검증 정책:
 *   - cardId       : 양의 정수 (DB bigint, 1 이상)
 *   - parentId     : 양의 정수 또는 null/undefined (root 댓글 시 null)
 *   - body         : trim 후 1~2000 자 (DB 응용 한도)
 *   - offset/limit : 페이지네이션 (limit 1~50, 옛 MAX_LIMIT 와 동일)
 */

import { z } from "zod";

/**
 * POST /api/comments — 댓글/답글 작성.
 *
 * raw JSON body 직접 수용. `parentId` 는 root 댓글일 때 null/undefined 둘 다 허용.
 * `body` 는 transform 으로 trim 후 길이 검증 (옛 .trim() 로직 보존).
 */
export const CommentCreateSchema = z
  .object({
    cardId: z.number().int().positive(),
    parentId: z.number().int().positive().nullable().optional(),
    body: z
      .string()
      .max(2000, "댓글은 2000자 이내로 작성해주세요.")
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "댓글 내용을 입력해 주세요."),
  })
  .strict();

export type CommentCreatePayload = z.infer<typeof CommentCreateSchema>;

/**
 * GET /api/comments?cardId=N&offset=0&limit=20
 *
 * URLSearchParams → string 만 들어오므로 coerce.number() 로 정수 변환.
 * offset/limit 누락 시 default (0 / 20). limit 상한 50 (옛 MAX_LIMIT 와 동일).
 */
export const CommentGetQuerySchema = z
  .object({
    cardId: z.coerce.number().int().positive(),
    offset: z.coerce.number().int().nonnegative().optional().default(0),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export type CommentGetQuery = z.infer<typeof CommentGetQuerySchema>;

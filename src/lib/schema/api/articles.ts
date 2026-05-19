/**
 * Articles API payload schemas (zod) — 보안 2.5차 D-3 (2026-05-19)
 *
 * 목적:
 *   - 클라가 보내는 payload 크기·타입을 서버 진입점에서 검증.
 *   - 비정상 페이로드(거대한 keywords, 100KB title 등)가 DB·RPC까지 도달하지 않도록 차단.
 *   - Mass Assignment(BOPLA) 방어: 화이트리스트만 통과.
 *
 * 사용:
 *   const parsed = ArticleCreateSchema.safeParse(rawJson);
 *   if (!parsed.success) return errorResponse(parsed.error, "invalid_input", "...", 400);
 *   const payload = parsed.data;
 */

import { z } from "zod";

const ExternalMetaSchema = z
  .object({
    title: z.string().max(500).optional(),
    description: z.string().max(2000).optional(),
    image: z.string().url().max(2048).nullable().optional(),
    siteName: z.string().max(200).optional(),
  })
  .strict();

const PubmedRefSchema = z
  .object({
    pmid: z.string().max(20).optional(),
    doi: z.string().max(200).optional(),
    title: z.string().max(1000).optional(),
    authors: z.string().max(2000).optional(),
    journal: z.string().max(300).optional(),
    year: z.union([z.string().max(10), z.number().int()]).optional(),
    url: z.string().url().max(2048).optional(),
  })
  .strict();

/**
 * POST /api/articles — 글 생성
 *
 * 라우트가 추가로 권한·status 분기 검증을 수행. 이 스키마는 형식·크기만.
 */
export const ArticleCreateSchema = z
  .object({
    type: z.enum(["post", "qa"]),
    category: z.string().max(20).optional(),
    status: z.enum(["draft", "pending_review", "published"]).optional(),
    title: z.string().max(500).optional(),
    body: z.string().max(30_000).optional(),
    doctor_slug: z.string().max(120).optional(),
    question: z.string().max(500).optional(),
    answer: z.string().max(30_000).optional(),
    keywords: z.array(z.string().min(1).max(50)).max(8).optional(),
    external_url: z.string().url().max(2048).optional(),
    external_meta: ExternalMetaSchema.optional(),
    hide_doctor_credential: z.boolean().optional(),
  })
  .strict();

export type ArticleCreatePayload = z.infer<typeof ArticleCreateSchema>;

/**
 * PUT /api/articles/[id] — 글 수정 (전부 optional, admin 전용 필드 포함)
 */
export const ArticleUpdateSchema = z
  .object({
    question: z.string().max(500).optional(),
    answer: z.string().max(30_000).optional(),
    keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
    category: z.string().max(20).optional(),
    external_url: z.string().url().max(2048).nullable().optional(),
    external_title: z.string().max(500).nullable().optional(),
    external_description: z.string().max(2000).nullable().optional(),
    external_image: z.string().url().max(2048).nullable().optional(),
    external_site_name: z.string().max(200).nullable().optional(),
    pubmed_ref: PubmedRefSchema.nullable().optional(),
    pubmed_refs: z.array(PubmedRefSchema).max(20).optional(),
    // admin 전용 — 라우트에서 isAdmin 가드 추가 검증
    status: z.enum(["draft", "pending_review", "published", "archived"]).optional(),
    is_pick: z.boolean().optional(),
    doctor_id: z.string().uuid().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .strict();

export type ArticleUpdatePayload = z.infer<typeof ArticleUpdateSchema>;

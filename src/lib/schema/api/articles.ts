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

// PubMed 참고문헌 객체 — 본 schema 가 단일 출처 (SSOT).
// 클라이언트 (PubmedRefsField.tsx 의 PubmedRefObj) 도 이 schema 의 z.infer 결과를
// import 해서 사용 — 형식 정의 한 곳, 분기 없음. 향후 형식 변경 시 본 schema 한
// 곳만 수정하면 클라이언트/서버 양쪽 자동 정합.
//
// 모든 필드 nullable + optional — DB jsonb 의 실제 값 형태 보존.
// 2026-05-26 fix (김수형 원장 회귀): 이전엔 client type 과 server zod 가 두 곳에
// 분산되어 있어 client 가 `authors_short`/`pubmed_url`/`doi_url` 전송했는데 server
// zod 는 옛 `authors`/`url` 기대 → "invalid_input" 에러. 본 SSOT 패턴으로 재발 차단.
// URL 또는 빈 문자열 허용 helper.
// 의도: DOI 가 도입(2000년대)되기 이전 발표된 옛 논문은 PubMed 등록은 됐지만 DOI 가
// 본래 없음 — 이런 ref 의 doi_url 이 빈 값인 건 데이터 모델상 정상. zod .url() 만
// 강제하면 그 ref 갖춘 카드 (production 65건) 수정 차단됨. 빈 값을 합법 표현으로 수용.
const UrlOrEmpty = z.union([z.string().url().max(2048), z.literal("")]);

export const PubmedRefSchema = z
  .object({
    pmid: z.string().max(20).nullable().optional(),
    doi: z.string().max(200).nullable().optional(),
    title: z.string().max(1000).nullable().optional(),
    journal: z.string().max(300).nullable().optional(),
    year: z.union([z.string().max(10), z.number().int()]).nullable().optional(),
    authors_short: z.string().max(2000).nullable().optional(),
    pubmed_url: UrlOrEmpty.nullable().optional(),
    doi_url: UrlOrEmpty.nullable().optional(),
  })
  .strict();

/** PubMed 참고문헌 객체 TypeScript 타입 — 클라이언트/서버 공통. */
export type PubmedRefObj = z.infer<typeof PubmedRefSchema>;

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
    // pubmed_refs: null = 참고문헌 비우기. EditClient handleSubmit 의
    //   `payload.pubmedRefs.length > 0 ? payload.pubmedRefs : null` 로직과 정합.
    //   ADR 0012 (2026-05-26): 옛 pubmed_ref 단수 필드 폐기, 배열 단일 출처.
    pubmed_refs: z.array(PubmedRefSchema).max(20).nullable().optional(),
    // admin 전용 — 라우트에서 isAdmin 가드 추가 검증
    status: z.enum(["draft", "pending_review", "published", "archived"]).optional(),
    is_pick: z.boolean().optional(),
    doctor_id: z.string().uuid().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .strict();

export type ArticleUpdatePayload = z.infer<typeof ArticleUpdateSchema>;

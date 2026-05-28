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
// 클라이언트 (PubmedRefsField.tsx) 와 서버 라우트 모두 본 schema 의 z.infer 결과 import.
//
// Critical-4 정규화 (2026-05-27, 마이그레이션 0169 적용 후):
//   - year 는 정수 (number | null). 옛 string 표기 (DB 858건) 전부 int 로 정규화 완료.
//     1800~2100 범위 가드 — 명백한 잘못된 입력 방지.
//   - doi_url 은 URL 또는 null (옛 "" 표기 64건 전부 null 로 정규화 완료).
//     pubmed_url 은 같은 정책 적용 가능하지만 별도 작업으로 분리 (이번 범위는 doi_url 만).
//
// 모든 필드 nullable + optional — DB jsonb 의 실제 값 형태 보존.
export const PubmedRefSchema = z
  .object({
    pmid: z.string().max(20).nullable().optional(),
    doi: z.string().max(200).nullable().optional(),
    title: z.string().max(1000).nullable().optional(),
    journal: z.string().max(300).nullable().optional(),
    year: z.number().int().min(1800).max(2100).nullable().optional(),
    authors_short: z.string().max(2000).nullable().optional(),
    pubmed_url: z.union([z.string().url().max(2048), z.literal("")]).nullable().optional(),
    doi_url: z.string().url().max(2048).nullable().optional(),
  })
  .strict();

/** PubMed 참고문헌 객체 TypeScript 타입 — 클라이언트/서버 공통. */
export type PubmedRefObj = z.infer<typeof PubmedRefSchema>;

/**
 * 외부 PubMed eutils wire-format (year:string, doi_url:"") 을 SSOT 형식 (PubmedRefObj)
 * 으로 정규화. admin/draft/{step2,pubmed-by-pmid} 라우트가 외부 응답을 받자마자 호출.
 *
 * 동작:
 *   - year: "2024" → 2024, 정수 아니거나 빈 값 → null
 *   - doi_url: "" → null, 유효 URL → 보존
 *   - 기타 string 필드: 빈 값 ("") → null 통일
 */
export function normalizePubmedRefWire(r: {
  pmid?: string | null;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: string | number | null;
  authors_short?: string | null;
  pubmed_url?: string | null;
  doi_url?: string | null;
} | null | undefined): PubmedRefObj | null {
  if (!r) return null;
  // year 정규화 (string → int)
  let yearNum: number | null = null;
  if (typeof r.year === "number" && Number.isFinite(r.year)) {
    yearNum = Math.trunc(r.year);
  } else if (typeof r.year === "string" && /^-?\d+$/.test(r.year.trim())) {
    yearNum = parseInt(r.year, 10);
  }
  if (yearNum !== null && (yearNum < 1800 || yearNum > 2100)) {
    yearNum = null;
  }
  const orNull = (v: string | null | undefined): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;
  return {
    pmid: orNull(r.pmid),
    doi: orNull(r.doi),
    title: orNull(r.title),
    journal: orNull(r.journal),
    year: yearNum,
    authors_short: orNull(r.authors_short),
    pubmed_url: orNull(r.pubmed_url),
    doi_url: orNull(r.doi_url),
  };
}

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
    // P2-4 (2026-05-27): 옛 question/answer 필드 폐기, title/body 만 사용.
    title: z.string().max(500).optional(),
    body: z.string().max(30_000).optional(),
    doctor_slug: z.string().max(120).optional(),
    keywords: z.array(z.string().min(1).max(50)).max(8).optional(),
    external_url: z.string().url().max(2048).optional(),
    external_meta: ExternalMetaSchema.optional(),
    hide_doctor_credential: z.boolean().optional(),
    // 2026-05-27 회귀 fix: WriteClient (의사 신규 Q&A) 가 참고문헌 1개 이상 첨부 시
    // pubmed_refs 를 함께 전송했는데 본 스키마에 누락되어 .strict() 가 알 수 없는 키로
    // 차단 → invalid_input 400. ArticleUpdateSchema 와 동일 형태로 추가.
    pubmed_refs: z.array(PubmedRefSchema).max(20).nullable().optional(),
  })
  .strict();

export type ArticleCreatePayload = z.infer<typeof ArticleCreateSchema>;

/**
 * PUT /api/articles/[id] — 글 수정 (전부 optional, admin 전용 필드 포함)
 */
export const ArticleUpdateSchema = z
  .object({
    // P2-4 (2026-05-27): 옛 question/answer → title/body 리네임.
    title: z.string().max(500).optional(),
    body: z.string().max(30_000).optional(),
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
    status: z.enum(["draft", "pending_review", "published", "archived", "hidden"]).optional(),
    is_pick: z.boolean().optional(),
    doctor_id: z.string().uuid().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
    // 배치 ⑤ 6번 (2026-05-28): admin EditClient → PUT 통일 — author 변경 + meta(timestamp) 갱신.
    author_id: z.string().uuid().nullable().optional(),
    meta: z.string().max(10_000).nullable().optional(),
  })
  .strict();

export type ArticleUpdatePayload = z.infer<typeof ArticleUpdateSchema>;

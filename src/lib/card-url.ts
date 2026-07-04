/**
 * Q&A 글 URL 생성 헬퍼.
 *
 * [R6-1 보류] doctorUrl/adminCardsByDoctor/profileUrl/loginUrl 은 현재 import 0건이나
 * @핸들 전환 시 재사용 가능성으로 삭제 보류(디렉터 확정) — 임의 삭제 금지.
 *
 * v5.1 spec (칼럼 폐기 후):
 *  - 의사 글 (doctor + post_year + post_slug):
 *      /doctors/{doctorSlug}/{year}/{post-slug} ← canonical (keyword slug, year 유지)
 *  - 회원 글 (author handle + shortcode):
 *      /{handle}/{shortcode} ← canonical (8자 base58, year 제거)
 *  - canonical 정보 부족 시 → 홈으로 (/qa, /feed, /article 라우트 폐기됨)
 */
export type QaUrlInput = {
  id: number;
  /** 'qa' / 'post' / 'review' / 'review_summary' — CardData.type 과 동일 (옛 "link" 폐기, P2-6) */
  type?: "qa" | "post" | "review" | "review_summary" | string;
  doctor?: { slug: string } | null;
  post_year?: number | null;
  post_slug?: string | null;
  shortcode?: string | null;
  author?: {
    handle?: string | null;
  } | null;
};

export function getQaUrl(qa: QaUrlInput): string {
  // 0) 시술 리포트 앵커(type=review_summary) — /reports/{en}.
  //    영문 슬러그(en)는 앵커 cards.post_slug 에 저장(마이그 0214).
  if (qa.type === "review_summary" && qa.post_slug) {
    return `/reports/${qa.post_slug}`;
  }

  // 1) 의사 글 — keyword slug
  if (qa.doctor?.slug && qa.post_year && qa.post_slug) {
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${qa.post_slug}`;
  }

  // 2) 회원 글 — /{handle}/{shortcode}
  if (qa.shortcode && qa.author?.handle) {
    return `/${qa.author.handle}/${qa.shortcode}`;
  }

  // 3) fallback — 모든 글에 SEO URL이 있어야 함. 누락이면 홈으로.
  return "/";
}

/**
 * 글 수정 페이지 URL.
 *
 * v5.1 spec: /write 라우트로 통합.
 *  - 신규 작성: /write
 *  - 기존 글 수정: /write/{shortcode}
 *
 * 권한 체크는 page.tsx에서 shortcode 기반으로만 진행 (handle 검증 불필요).
 * 정보 부족 시 null 반환 — 호출 측에서 메뉴 노출/숨김 처리.
 */
export function getQaEditUrl(qa: QaUrlInput): string | null {
  // 시술 리포트 앵커(review_summary)는 본문 편집 N/A — 메뉴 미노출.
  if (qa.type === "review_summary") return null;
  if (!qa.shortcode) return null;
  // 시술후기(type=review)는 일반 글 에디터가 아니라 후기 전용 에디터로.
  if (qa.type === "review") return `/review/${qa.shortcode}/edit`;
  return `/write/${qa.shortcode}`;
}

// ─────────────────────────────────────────────────────────────────
// Phase 7-A (2026-05-16): URL 헬퍼 확장 — 하드코딩 라우트 통합 출처.
// ─────────────────────────────────────────────────────────────────

/** 의사 프로필 URL. */
export function doctorUrl(slug: string): string {
  return `/doctors/${slug}`;
}

/** 의사의 admin 글 관리 페이지 URL — query 옵션 지원. */
export function adminCardsByDoctor(
  slug: string,
  opts: {
    type?: "qa" | "post";
    status?: "draft" | "pending_review" | "published" | "archived";
    sort?: string;
  } = {},
): string {
  const params = new URLSearchParams({ doctor: slug });
  if (opts.type) params.set("type", opts.type);
  if (opts.status) params.set("status", opts.status);
  if (opts.sort) params.set("sort", opts.sort);
  return `/admin/cards?${params.toString()}`;
}

/** 회원/원장 프로필 URL — handle 또는 fallback /u/{id}. */
export function profileUrl(input: {
  handle?: string | null;
  id?: string | null;
}): string | null {
  if (input.handle) return `/${input.handle}`;
  if (input.id) return `/u/${input.id}`;
  return null;
}

/** 로그인 페이지 URL — next/error 쿼리 통합. */
export function loginUrl(
  opts: { next?: string; error?: string } = {},
): string {
  const params = new URLSearchParams();
  if (opts.next) params.set("next", opts.next);
  if (opts.error) params.set("error", opts.error);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}


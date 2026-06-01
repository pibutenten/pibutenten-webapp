import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import ReviewForm, { type ProcedureOption } from "./ReviewForm";

export const dynamic = "force-dynamic";

/**
 * /review/new — 시술후기 작성 페이지 (P3-d, 서버 컴포넌트).
 *
 * 흐름 (write/page.tsx 모사):
 *   1. 비로그인 → /login?next=/review/new.
 *   2. active identity 없음 → /login?error=...
 *   3. 미온보딩(birthdate NULL)은 middleware 가 /onboarding 으로 자동 게이트 —
 *      여기서 별도 처리 안 함 (write 페이지와 동일).
 *   4. procedure_taxonomy(정식+하위) 조회. 카테고리(리프팅→스킨부스터) 순으로 묶고,
 *      각 카테고리 안에서는 **태그 인기순**(발행 카드 keywords 빈도 desc, 동률 ko)으로 정렬.
 *      — 태그 검색 화면(getPopularByCategory)과 동일 규칙. 정식·하위 모두 독립 선택 가능.
 *   5. active handle 도 전달 — 제출 성공 시 /{handle}/{shortcode} 상세 이동에 사용.
 */

type TaxonomyRow = {
  ko: string;
  parent_ko: string | null;
  category: string;
};

// 카테고리 표시 순서 (리프팅 → 스킨부스터). taxonomy.category enum 과 일치.
const CATEGORY_ORDER: Record<string, number> = {
  lifting: 0,
  injectables: 1,
};
const CATEGORY_LABEL: Record<string, string> = {
  lifting: "리프팅",
  injectables: "스킨부스터",
};

export default async function ReviewNewPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/review/new");

  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) redirect("/login?error=프로필을 찾을 수 없습니다");

  // 시술 분류 조회 (anon/authenticated SELECT 허용 — RLS procedure_taxonomy_read).
  const { data: taxData } = await supabase
    .from("procedure_taxonomy")
    .select("ko, parent_ko, category")
    .eq("active", true)
    .returns<TaxonomyRow[]>();
  const rows = taxData ?? [];

  // 태그 인기순 — 발행 카드 keywords 빈도(태그 검색 getPopularByCategory 와 동일 규칙).
  const { data: kwData } = await supabase
    .from("cards")
    .select("keywords")
    .eq("status", "published");
  const counts = new Map<string, number>();
  for (const row of (kwData ?? []) as { keywords: string[] | null }[]) {
    for (const kw of row.keywords ?? []) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }

  // 카테고리(리프팅→스킨부스터) → 그 안에서 빈도 desc, 동률은 ko 사전순.
  const collator = new Intl.Collator("ko");
  const procedures: ProcedureOption[] = rows
    .slice()
    .sort((a, b) => {
      const ca = CATEGORY_ORDER[a.category] ?? 99;
      const cb = CATEGORY_ORDER[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      const fa = counts.get(a.ko) ?? 0;
      const fb = counts.get(b.ko) ?? 0;
      if (fb !== fa) return fb - fa;
      return collator.compare(a.ko, b.ko);
    })
    .map((r) => ({
      value: r.ko,
      label: r.ko,
      parentKo: r.parent_ko,
      categoryLabel: CATEGORY_LABEL[r.category] ?? r.category,
    }));

  return <ReviewForm procedures={procedures} handle={idCtx.active.handle} />;
}

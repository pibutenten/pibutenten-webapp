/**
 * 시술후기 폼의 시술 선택지(ProcedureOption[]) 빌드 — /review/new 와 /review/[shortcode]/edit 공유.
 *
 * procedure_taxonomy(정식+하위) 를 카테고리(리프팅→스킨부스터) 순으로 묶고,
 * 각 카테고리 안에서 발행 카드 keywords 빈도(태그 인기순) desc, 동률은 ko 사전순으로 정렬.
 * (태그 검색 getPopularByCategory 와 동일 규칙)
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type TaxonomyRow = {
  ko: string;
  parent_ko: string | null;
  category: string;
};

// 카테고리 표시 순서/라벨 — taxonomy.category enum 과 일치.
const CATEGORY_ORDER: Record<string, number> = { lifting: 0, injectables: 1 };
const CATEGORY_LABEL: Record<string, string> = {
  lifting: "리프팅",
  injectables: "스킨부스터",
};

export async function getReviewProcedures(
  supabase: ServerClient,
): Promise<ProcedureOption[]> {
  const { data: taxData } = await supabase
    .from("procedure_taxonomy")
    .select("ko, parent_ko, category")
    .eq("active", true)
    .returns<TaxonomyRow[]>();
  const rows = taxData ?? [];

  // 태그 인기순 — 발행 카드 keywords 빈도.
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

  const collator = new Intl.Collator("ko");
  return rows
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
}

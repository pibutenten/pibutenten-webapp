import { categorize } from "./category-sets";
import type { CategorySlug } from "./categories";
import { createSupabaseServerClient } from "./supabase/server";

export type PopularByCategory = Record<CategorySlug, string[]>;

const TOP_N = 32;

/**
 * 발행된 모든 qas의 keywords를 카운트 → 카테고리별 빈도 상위 N개.
 * 매핑 안 되는 키워드는 'other' (피부상식)에 떨어짐.
 */
export async function getPopularByCategory(): Promise<PopularByCategory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("qas")
    .select("keywords")
    .eq("published", true);

  if (error || !data) {
    return { condition: [], lifting: [], injection: [], homecare: [], other: [] };
  }

  // 키워드 카운트
  const counts = new Map<string, number>();
  for (const row of data as { keywords: string[] | null }[]) {
    const ks = row.keywords ?? [];
    for (const kw of ks) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }

  // 카테고리 버킷
  const buckets: Record<CategorySlug, [string, number][]> = {
    condition: [],
    lifting: [],
    injection: [],
    homecare: [],
    other: [],
  };
  for (const [kw, freq] of counts) {
    buckets[categorize(kw)].push([kw, freq]);
  }

  // 빈도 desc, 같으면 ko 순
  const collator = new Intl.Collator("ko");
  const result: PopularByCategory = {
    condition: [],
    lifting: [],
    injection: [],
    homecare: [],
    other: [],
  };
  for (const cat of Object.keys(buckets) as CategorySlug[]) {
    buckets[cat].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
    result[cat] = buckets[cat].slice(0, TOP_N).map(([kw]) => kw);
  }

  return result;
}

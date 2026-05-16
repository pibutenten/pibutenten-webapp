import { categorize } from "./category-sets";
import type { CategorySlug } from "./categories";
import { createSupabaseServerClient } from "./supabase/server";

export type PopularByCategory = Record<CategorySlug, string[]>;

// 카테고리별 충분히 가져와서 화면에서 줄(line)로 잘라 보여줌.
// (모바일 펼친 상태 7줄, 데스크탑 3줄 기준 + 여유)
const TOP_N = 60;

/**
 * 발행된 모든 cards의 keywords를 카운트 → 카테고리별 빈도 상위 N개.
 * 매핑 안 되는 태그는 'knowledge' (피부상식)에 떨어짐.
 */
export async function getPopularByCategory(): Promise<PopularByCategory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cards")
    .select("keywords")
    .eq("status", "published");

  if (error || !data) {
    return { concerns: [], lifting: [], injectables: [], homecare: [], knowledge: [] };
  }

  // 태그 카운트
  const counts = new Map<string, number>();
  for (const row of data as { keywords: string[] | null }[]) {
    const ks = row.keywords ?? [];
    for (const kw of ks) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
  }

  // 카테고리 버킷
  const buckets: Record<CategorySlug, [string, number][]> = {
    concerns: [],
    lifting: [],
    injectables: [],
    homecare: [],
    knowledge: [],
  };
  for (const [kw, freq] of counts) {
    buckets[categorize(kw)].push([kw, freq]);
  }

  // 빈도 desc, 같으면 ko 순
  const collator = new Intl.Collator("ko");
  const result: PopularByCategory = {
    concerns: [],
    lifting: [],
    injectables: [],
    homecare: [],
    knowledge: [],
  };
  for (const cat of Object.keys(buckets) as CategorySlug[]) {
    buckets[cat].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));
    result[cat] = buckets[cat].slice(0, TOP_N).map(([kw]) => kw);
  }

  return result;
}

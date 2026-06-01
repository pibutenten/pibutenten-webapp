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
 *   4. procedure_taxonomy 를 조회해 카테고리(리프팅→주입)+sort_order 로 정렬,
 *      정식 시술(parent_ko NULL) 아래 하위(parent_ko=해당 ko)를 묶어 그룹화한
 *      평면 옵션 리스트를 ReviewForm 에 전달. 정식·하위 모두 독립 선택 가능.
 *   5. active handle 도 전달 — 제출 성공 시 /{handle}/{shortcode} 상세 이동에 사용.
 */

type TaxonomyRow = {
  ko: string;
  parent_ko: string | null;
  category: string;
  sort_order: number;
};

// 카테고리 표시 순서 (리프팅 → 주입). taxonomy.category enum 과 일치.
const CATEGORY_ORDER: Record<string, number> = {
  lifting: 0,
  injectables: 1,
};
const CATEGORY_LABEL: Record<string, string> = {
  lifting: "리프팅",
  injectables: "주입",
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
    .select("ko, parent_ko, category, sort_order")
    .eq("active", true)
    .returns<TaxonomyRow[]>();

  const rows = taxData ?? [];

  // 정식 시술(parent_ko NULL) 을 카테고리(리프팅→주입) + sort_order 로 정렬.
  const parents = rows
    .filter((r) => r.parent_ko === null)
    .sort((a, b) => {
      const ca = CATEGORY_ORDER[a.category] ?? 99;
      const cb = CATEGORY_ORDER[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return a.sort_order - b.sort_order;
    });

  // 상위 ko → 하위 목록 (sort_order 정렬).
  const childrenByParent = new Map<string, TaxonomyRow[]>();
  for (const r of rows) {
    if (!r.parent_ko) continue;
    const list = childrenByParent.get(r.parent_ko) ?? [];
    list.push(r);
    childrenByParent.set(r.parent_ko, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  // 평면 옵션 — 각 정식 시술 바로 뒤에 그 하위를 묶어 배치.
  // value=ko(서버 검증값), label=표시명, parentKo=소속(하위면 상위 ko), categoryLabel=그룹 헤더.
  const procedures: ProcedureOption[] = [];
  for (const p of parents) {
    procedures.push({
      value: p.ko,
      label: p.ko,
      parentKo: null,
      categoryLabel: CATEGORY_LABEL[p.category] ?? p.category,
    });
    for (const c of childrenByParent.get(p.ko) ?? []) {
      procedures.push({
        value: c.ko,
        label: c.ko,
        parentKo: p.ko,
        categoryLabel: CATEGORY_LABEL[c.category] ?? c.category,
      });
    }
  }

  return <ReviewForm procedures={procedures} handle={idCtx.active.handle} />;
}

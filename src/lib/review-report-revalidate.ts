/**
 * 시술 리포트 온디맨드 재검증 경로 산출 (후기·시술일기 통합 Phase 3a, F3).
 *
 * 공개 후기의 결론칸(satisfaction/recommend/pain)이 사후 변동(시계열 롤업)하거나, 후기가
 * 공개 철회(unpublish)되면 /reports/{procedure} 의 ISR 캐시·JSON-LD aggregateRating 이
 * stale 이 된다. 그 호출부(API 레이어)가 영향받는 리포트 경로를 revalidatePath 로 무효화한다.
 *
 * 어느 리포트가 영향받는가:
 *   /reports/{ko} 집계는 getProcedureReport(ko) → procedure_family(ko)(= 자기 + 직속 자식)
 *   를 IN 으로 묶어 집계한다. 따라서 procedure_ko=X 인 후기 1건은 두 리포트에 들어간다.
 *     (1) X 자신의 리포트         — family(X) 에 X 포함.
 *     (2) X 의 부모(parent_ko=P)  — family(P) 에 자식 X 포함.
 *   → X 와 X 의 부모(있으면) 두 시술의 리포트를 재검증한다.
 *
 * canonical URL 은 한글(/reports/{ko}). 다만 ISR 캐시 키는 실제 요청 경로 기준이므로,
 * 한글 ko 경로와 영문 en(308 전 캐시) 경로를 모두 무효화한다(과무효화는 안전·저비용).
 */
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * 후기의 procedure_ko 로부터 재검증할 리포트 경로 목록 산출.
 *   - 자기(ko) + 부모(parent_ko, 있으면)의 ko·en 슬러그 경로.
 *   - 미발견·en NULL 은 건너뜀(깨진 경로 무효화 방지). 실패해도 throw 하지 않음(저장 성공 무영향).
 */
export async function resolveReportRevalidatePaths(
  supabase: ServerClient,
  procedureKo: string,
): Promise<string[]> {
  const ko = procedureKo.trim();
  if (!ko) return [];

  // 자기 + 부모 ko 묶음.
  const targetKos = new Set<string>([ko]);
  try {
    const { data: selfRow } = await supabase
      .from("tag_dictionary")
      .select("parent_ko")
      .eq("ko", ko)
      .eq("is_procedure", true)
      .maybeSingle<{ parent_ko: string | null }>();
    if (selfRow?.parent_ko) targetKos.add(selfRow.parent_ko);
  } catch {
    /* parent 조회 실패는 자기 경로만으로 진행 */
  }

  // ko → en 슬러그(앵커·canonical 링크). en 없는 시술은 한글 경로만.
  const enByKo = new Map<string, string | null>();
  try {
    const { data: enRows } = await supabase
      .from("tag_dictionary")
      .select("ko, en")
      .eq("is_procedure", true)
      .in("ko", Array.from(targetKos));
    for (const r of (enRows ?? []) as Array<{ ko: string; en: string | null }>) {
      enByKo.set(r.ko, r.en);
    }
  } catch {
    /* en 조회 실패는 한글 경로만으로 진행 */
  }

  const paths: string[] = [];
  for (const t of targetKos) {
    paths.push(`/reports/${encodeURIComponent(t)}`);
    const en = enByKo.get(t);
    if (en) paths.push(`/reports/${en}`);
  }
  return paths;
}

/**
 * 후기 procedure_ko 의 영향 리포트 경로를 모두 revalidatePath.
 *   revalidatePath 실패는 저장 성공에 영향 주지 않음(개별 try/catch).
 */
export async function revalidateProcedureReports(
  supabase: ServerClient,
  procedureKo: string,
): Promise<void> {
  const paths = await resolveReportRevalidatePaths(supabase, procedureKo);
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      /* noop — 다음 경로 계속 */
    }
  }
}

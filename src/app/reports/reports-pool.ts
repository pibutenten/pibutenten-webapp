/**
 * reports-pool — /reports 공유 layout 과 허브 page 가 같은 요청 안에서 시술 리포트 풀을
 * 한 번만 RPC 로 가져오도록 요청 단위 캐시(react cache)로 감싼 헬퍼.
 *
 * layout 은 사이드바 '후기 많은 시술' 상위 N개를, page 는 허브 목록 전체를 같은 풀에서 파생하므로
 * cache 로 get_review_summary_pool RPC 중복 호출을 제거한다(요청 종료 시 자동 무효).
 */

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewSummaryFeedPool } from "@/lib/procedure-report";

export const getReportsPoolCached = cache(async () => {
  const supabase = await createSupabaseServerClient();
  return getReviewSummaryFeedPool(supabase);
});

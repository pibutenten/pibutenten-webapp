/**
 * /admin/auth-errors — 회원가입/로그인 OAuth 콜백 에러 운영 추적기 (PR-OPS, 2026-05-19).
 *
 * 데이터 출처: `auth_callback_errors` 테이블 (0135).
 * 접근: admin (super or doctor admin) 전용 — RLS 가 강제.
 *
 * 렌더: 앱 스킨 셸(AdminAuthErrorsView)로 위임. 데이터 fetch·가드는 이 서버 페이지가 그대로 담당.
 *   - 상단바·배경만 앱 셸, 본문(기간 카운트 + 최근 50건 표)은 운영 구조 유지.
 *
 * UI 최소 구성 (1차):
 *   - 상단: 최근 24h / 7d / 30d 발생 건수.
 *   - 본문: 최근 50건 표 (시각 / provider / step / error_kind / email / error_id).
 *   - PII 는 모두 마스킹된 값만 표시 (DB 저장 시 이미 마스킹됨).
 *   - error_id 클릭 → Vercel logs 에서 grep 검색 안내.
 *
 * 향후 확장 (별도 PR): 그래프 / 필터 / "해결됨" 토글 / 같은 IP 그루핑.
 */
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import AdminAuthErrorsView, {
  type AuthErrorRow,
} from "./AdminAuthErrorsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "회원가입 에러 로그",
  robots: { index: false, follow: false },
};

export default async function AuthErrorsPage() {
  await requireAdminPage("/admin/auth-errors");
  const supabase = await createSupabaseServerClient();

  // 최근 50건
  const { data: rowsData, error: listErr } = await supabase
    .from("auth_callback_errors")
    .select(
      "error_id, created_at, provider, step, error_kind, error_message, attempted_email_masked, ip_masked, user_agent",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (rowsData ?? []) as AuthErrorRow[];

  // 기간별 카운트 — head:true + count
  const now = new Date();
  const since = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const [c24h, c7d, c30d] = await Promise.all([
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(24 * 60 * 60 * 1000)),
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(7 * 24 * 60 * 60 * 1000)),
    supabase
      .from("auth_callback_errors")
      .select("error_id", { count: "exact", head: true })
      .gte("created_at", since(30 * 24 * 60 * 60 * 1000)),
  ]);

  return (
    <AdminAuthErrorsView
      rows={rows}
      c24h={c24h.count ?? 0}
      c7d={c7d.count ?? 0}
      c30d={c30d.count ?? 0}
      listError={!!listErr}
    />
  );
}

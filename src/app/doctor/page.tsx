import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveIdentity } from "@/lib/identity-server";
import { getDoctorDashboardData } from "@/lib/doctor-dashboard";
import DoctorDashboardWidget from "@/components/doctor-dashboard/DoctorDashboardWidget";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "원장 대시보드",
  robots: { index: false, follow: false },
};

/**
 * /doctor — 의사 본인 전용 대시보드 (2026-05-22 신설).
 *
 * 정책 (사용자 결정):
 *   - admin → /admin (관리자 대시보드)
 *   - doctor → /doctor (본 페이지, 본인 카드·검수 대기·빠른 작업)
 *   - /doctors/{slug} 는 외부인이 보는 공개 프로필 (그대로 유지)
 *
 * 가드:
 *   - 비로그인 → /login
 *   - active identity 가 doctor + doctor_accounts 매핑 없으면 → /admin (admin이면) 또는 /
 *
 * IdentitySwitcher 의 doctor identity 진입 destination.
 */
export default async function DoctorDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/doctor");

  const active = await resolveActiveIdentity(supabase, user.id, user.email);

  // 의사 매핑 없는 active 면 진입 차단 — admin 매핑 있으면 /admin, 그 외 /
  if (!active?.doctorId) {
    if (active?.role === "admin") redirect("/admin");
    redirect("/");
  }

  // doctor handle/slug 정보 — 헤더 표시용
  const { data: doctorRow } = await supabase
    .from("doctors")
    .select("slug, name")
    .eq("id", active.doctorId)
    .maybeSingle();
  const doctorSlug = (doctorRow as { slug: string } | null)?.slug ?? null;
  const doctorName = (doctorRow as { name: string } | null)?.name ?? active.displayName;

  const data = await getDoctorDashboardData(
    supabase,
    active.doctorId,
    active.profileId,
  );

  return (
    <section className="mx-auto w-full max-w-[720px] py-6">
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref="/" />
      </div>
      <header className="mb-4 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          원장 대시보드
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {doctorName} · 본인 카드 관리·검수 대기·빠른 작업 (영구 noindex)
        </p>
      </header>
      <DoctorDashboardWidget data={data} doctorSlug={doctorSlug} />
    </section>
  );
}

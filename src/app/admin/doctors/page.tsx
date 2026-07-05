import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import {
  asDoctorProfileData,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import { getClinicBranch } from "@/lib/clinic-branches";
import AdminDoctorsView from "./AdminDoctorsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "전문의 관리",
  robots: { index: false, follow: false },
};

type DoctorRow = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  clinic: string | null;
  branch: string | null;
  clinic_id: number | null;
  is_affiliated: boolean;
  is_listed: boolean;
  profile_data: unknown;
};

/**
 * 프로필이 1개 이상의 키로 채워졌는지 판정.
 * 빈 string·빈 배열은 채워진 것으로 안 침.
 */
function isProfileFilled(p: DoctorProfileData): boolean {
  for (const v of Object.values(p)) {
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

export default async function AdminDoctorsPage() {
  // PRD §C — 묶음 OR 가드. 전문의 관리는 super admin 전용 (doctor 차단).
  await requireAdminPage("/admin/doctors", { superAdminOnly: true });
  const supabase = await createSupabaseServerClient();

  const { data: doctors } = await supabase
    .from("doctors")
    .select(
      "id, slug, name, title, clinic, branch, clinic_id, is_affiliated, is_listed, profile_data",
    )
    .order("name", { ascending: true })
    .returns<DoctorRow[]>();

  return (
    <AdminDoctorsView>
    <section className="w-full py-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink-700)]">
            의사 프로필 관리
          </h1>
          <p className="mt-1 text-xs text-[var(--ink-300)]">
            학력·경력·전문분야 등 확장 프로필을 입력하세요. 입력된 항목만
            의사 페이지에 노출됩니다.
          </p>
        </div>
      </div>

      {!doctors || doctors.length === 0 ? (
        <div className="rounded-[var(--r-card)] border border-dashed border-[var(--line)] bg-white p-8 text-center text-sm text-[var(--ink-300)]">
          등록된 의사가 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => {
            const profile = asDoctorProfileData(d.profile_data);
            const filled = isProfileFilled(profile);
            const branchInfo = getClinicBranch(d.clinic_id);
            return (
              <div
                key={d.id}
                className="flex flex-col rounded-[var(--r-card)] border border-[var(--line)] bg-white p-4 shadow-[var(--card-shadow)]"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--tt-blue-tint)]">
                    <Image
                      src={getDoctorPhoto(d.slug)}
                      alt={d.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-[var(--ink-700)]">
                        {d.name}
                      </h2>
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
                          (filled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700")
                        }
                        title={filled ? "프로필 채워짐" : "프로필 비어있음"}
                      >
                        {filled ? "✓ 채워짐" : "✗ 비어있음"}
                      </span>
                    </div>
                    {d.title && (
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-500)]">
                        {d.title}
                      </p>
                    )}
                    {(d.clinic || branchInfo?.branch || d.branch) && (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--ink-300)]">
                        {[d.clinic, branchInfo?.branch ?? d.branch]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
                          (branchInfo
                            ? "bg-[var(--tt-blue-tint)] text-[var(--tt-blue-deep)]"
                            : "bg-[var(--bg-soft)] text-[var(--ink-300)]")
                        }
                        title="근무 지점"
                      >
                        {branchInfo ? branchInfo.branch : "지점 미지정"}
                      </span>
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
                          (d.is_affiliated
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-[var(--bg-soft)] text-[var(--ink-300)]")
                        }
                        title={d.is_affiliated ? "재직 중" : "퇴사(비재직)"}
                      >
                        {d.is_affiliated ? "재직" : "퇴사"}
                      </span>
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
                          (d.is_listed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-[var(--bg-soft)] text-[var(--ink-300)]")
                        }
                        title={d.is_listed ? "공개(페이지 노출)" : "비공개"}
                      >
                        {d.is_listed ? "공개" : "비공개"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end">
                  <Link
                    href={`/admin/doctors/${d.slug}/edit`}
                    className="inline-flex h-8 items-center rounded-[var(--r-btn)] border border-[var(--tt-blue)] px-3 text-xs font-semibold text-[var(--tt-blue-deep)] transition-colors hover:bg-[var(--tt-blue-tint)]"
                  >
                    편집
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
    </AdminDoctorsView>
  );
}

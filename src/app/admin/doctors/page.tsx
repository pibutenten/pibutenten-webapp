import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import {
  asDoctorProfileData,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import BackButton from "@/components/BackButton";

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
    .select("id, slug, name, title, clinic, branch, profile_data")
    .order("name", { ascending: true })
    .returns<DoctorRow[]>();

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            의사 프로필 관리
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            학력·경력·전문분야 등 확장 프로필을 입력하세요. 입력된 항목만
            의사 페이지에 노출됩니다.
          </p>
        </div>
      </div>

      {!doctors || doctors.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          등록된 의사가 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => {
            const profile = asDoctorProfileData(d.profile_data);
            const filled = isProfileFilled(profile);
            return (
              <div
                key={d.id}
                className="flex flex-col rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
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
                      <h2 className="truncate text-sm font-bold text-[var(--text)]">
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
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {d.title}
                      </p>
                    )}
                    {(d.clinic || d.branch) && (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                        {[d.clinic, d.branch].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end">
                  <Link
                    href={`/admin/doctors/${d.slug}/edit`}
                    className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
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
  );
}

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import { asDoctorProfileData } from "@/lib/doctor-profile";
import DoctorProfileEditForm from "./DoctorProfileEditForm";
import AdminDoctorEditView from "./AdminDoctorEditView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "전문의 프로필 편집",
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

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function AdminDoctorEditPage({ params }: Props) {
  const { slug } = await params;
  // 2026-05-22: super admin 또는 본인 doctor admin 만 통과. 다른 의사 slug 면 본인 대시보드로.
  const guard = await requireAdminPage(`/admin/doctors/${slug}/edit`);
  const supabase = await createSupabaseServerClient();

  const { data: doctor } = await supabase
    .from("doctors")
    .select(
      "id, slug, name, title, clinic, branch, clinic_id, is_affiliated, is_listed, profile_data",
    )
    .eq("slug", slug)
    .maybeSingle()
    .returns<DoctorRow>();
  if (!doctor) notFound();

  // 권한 분기: super admin 모두 가능 / doctor admin 은 본인 slug 만
  if (!guard.isSuperAdmin && doctor.id !== guard.activeDoctorId) {
    redirect("/doctor");
  }

  const initial = asDoctorProfileData(doctor.profile_data);

  return (
    <AdminDoctorEditView>
    <section className="w-full py-6">
      <div className="mb-5 rounded-[var(--r-card)] border border-[var(--line)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--tt-blue-tint)]">
            <Image
              src={getDoctorPhoto(doctor.slug)}
              alt={doctor.name}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[var(--ink-700)]">
              {doctor.name}
            </h1>
            {doctor.title && (
              <p className="mt-0.5 text-sm text-[var(--ink-500)]">
                {doctor.title}
              </p>
            )}
            {(doctor.clinic || doctor.branch) && (
              <p className="mt-0.5 text-xs text-[var(--ink-300)]">
                {[doctor.clinic, doctor.branch].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <DoctorProfileEditForm
        slug={doctor.slug}
        initial={initial}
        isSuperAdmin={guard.isSuperAdmin}
        settings={{
          clinicId: doctor.clinic_id,
          isAffiliated: doctor.is_affiliated,
          isListed: doctor.is_listed,
        }}
      />
    </section>
    </AdminDoctorEditView>
  );
}

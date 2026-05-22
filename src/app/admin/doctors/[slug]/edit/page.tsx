import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import { asDoctorProfileData } from "@/lib/doctor-profile";
import DoctorProfileEditForm from "./DoctorProfileEditForm";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

type DoctorRow = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  clinic: string | null;
  branch: string | null;
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
    .select("id, slug, name, title, clinic, branch, profile_data")
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
    <section className="w-full py-6">
      

      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
            <Image
              src={getDoctorPhoto(doctor.slug)}
              alt={doctor.name}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[var(--text)]">
              {doctor.name}
            </h1>
            {doctor.title && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {doctor.title}
              </p>
            )}
            {(doctor.clinic || doctor.branch) && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {[doctor.clinic, doctor.branch].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <DoctorProfileEditForm slug={doctor.slug} initial={initial} />
    </section>
  );
}

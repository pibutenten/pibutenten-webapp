import { notFound } from "next/navigation";
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
  // PRD §C — 묶음 OR 가드. 전문의 프로필 편집은 super admin 전용 (doctor 차단).
  await requireAdminPage(`/admin/doctors/${slug}/edit`, { superAdminOnly: true });
  const supabase = await createSupabaseServerClient();

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, slug, name, title, clinic, branch, profile_data")
    .eq("slug", slug)
    .maybeSingle()
    .returns<DoctorRow>();
  if (!doctor) notFound();

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

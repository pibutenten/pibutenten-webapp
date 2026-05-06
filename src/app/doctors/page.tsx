import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";

export const dynamic = "force-dynamic";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  title: string;
  clinic: string;
  branch: string | null;
  photo_url: string | null;
  intro: string | null;
  sort_order: number;
};

export default async function DoctorsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: doctors, error } = await supabase
    .from("doctors")
    .select(
      "id, slug, name, title, clinic, branch, photo_url, intro, sort_order",
    )
    .order("sort_order", { ascending: true })
    .returns<Doctor[]>();

  if (error) {
    return (
      <section className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        원장님 정보를 불러오지 못했어요.
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
          {error.message}
        </pre>
      </section>
    );
  }

  if (!doctors || doctors.length === 0) {
    return (
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
        등록된 원장님이 없습니다.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">피부과 전문의</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          피부텐텐의 피부과 전문의들이 직접 답합니다.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4 min-[900px]:gap-4">
        {doctors.map((d) => {
          const theme = getDoctorTheme(d.slug);
          const photo = d.photo_url || getDoctorPhoto(d.slug);

          return (
            <Link
              key={d.id}
              href={`/doctors/${d.slug}`}
              aria-label={`${d.name} 원장님 소개로 이동`}
              className="block overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
            >
              <div
                className="relative aspect-square w-full overflow-hidden"
                style={{ background: `${theme.bg}33` }}
              >
                <Image
                  src={photo}
                  alt={`${d.name} 원장님`}
                  fill
                  sizes="(max-width: 900px) 50vw, 360px"
                  className="object-cover"
                  style={{
                    objectPosition: "50% 10%",
                    transform: `translate(${theme.offsetX ?? 0}px, ${theme.offsetY ?? 0}px)`,
                  }}
                  priority={d.sort_order <= 20}
                />
              </div>

              <div className="px-3 py-3 text-center">
                <h2 className="text-base font-bold text-[var(--text)]">
                  {d.name}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {d.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

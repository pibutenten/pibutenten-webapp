import Image from "next/image";
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
    <section className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
      {doctors.map((d) => {
        const theme = getDoctorTheme(d.slug);
        const photo = d.photo_url || getDoctorPhoto(d.slug);

        return (
          <article
            key={d.id}
            className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
          >
            <div
              className="flex items-center gap-4 p-4"
              style={{
                background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bgSoft} 100%)`,
              }}
            >
              <div
                className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-white/60"
                style={{ boxShadow: `0 0 0 3px ${theme.ring}` }}
              >
                <Image
                  src={photo}
                  alt={`${d.name} 원장`}
                  fill
                  sizes="96px"
                  className="object-cover"
                  priority={d.sort_order <= 20}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <h2 className="text-lg font-bold text-[var(--text)]">
                    {d.name}
                  </h2>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: theme.accent }}
                  >
                    원장
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {d.title}
                </p>
                <p className="mt-1 text-[13px] font-medium text-[var(--text)]">
                  {[d.clinic, d.branch].filter(Boolean).join(" ")}
                </p>
              </div>
            </div>

            {d.intro && (
              <div className="bg-white px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {d.intro}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Props = {
  params: Promise<{ slug: string }>;
};

type Doctor = {
  id: string;
  slug: string;
  name: string;
  title: string;
  clinic: string;
  branch: string | null;
  intro: string | null;
};

export default async function DoctorDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, slug, name, title, clinic, branch, intro")
    .eq("slug", slug)
    .maybeSingle()
    .returns<Doctor>();

  if (!doctor) notFound();

  const { data: qas, count } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
      { count: "exact" },
    )
    .eq("published", true)
    .eq("doctor_id", doctor.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE)
    .returns<QACardData[]>();

  const theme = getDoctorTheme(doctor.slug);
  const photo = getDoctorPhoto(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");

  return (
    <section className="space-y-6">
      {/* 원장님 hero — 좌: 멘트 + 이름·소속 / 우: 누끼 사진이 하단선 위에 서 있음 */}
      <header
        className="relative grid items-end gap-5 border-b pb-0 sm:gap-8"
        style={{
          gridTemplateColumns: "1fr 140px",
          borderColor: theme.ring ?? "var(--border)",
        }}
      >
        {/* 좌측: 멘트 + 이름 */}
        <div className="flex flex-col justify-end space-y-4 pb-5 sm:pb-6">
          {doctor.intro && (
            <p className="whitespace-pre-line text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]">
              {doctor.intro}
            </p>
          )}
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              {doctor.name} <span className="text-[var(--text-secondary)]">원장님</span>
            </h1>
            <p
              className="mt-1 text-[13px] font-medium sm:text-[14px]"
              style={{ color: theme.accent }}
            >
              {affiliation}
            </p>
          </div>
        </div>

        {/* 우측: 누끼 사진 (object-bottom으로 하단선 위에 자연스럽게) */}
        <div className="relative h-[220px] w-full sm:h-[320px]">
          <Image
            src={photo}
            alt={`${doctor.name} 원장님`}
            fill
            sizes="(max-width: 600px) 140px, 220px"
            className="object-contain object-bottom"
            priority
          />
        </div>
      </header>

      {/* Q&A 헤더 */}
      <div className="flex items-baseline justify-between pt-2">
        <h2 className="text-lg font-bold text-[var(--text)]">
          {doctor.name} 원장님의 Q&A
        </h2>
        <span className="text-[13px] text-[var(--text-muted)]">
          {count ?? 0}개
        </span>
      </div>

      {/* Q&A 피드 (해당 원장만) */}
      {!qas || qas.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          아직 등록된 Q&A가 없어요.
        </div>
      ) : (
        <QAFeed
          initial={qas}
          pageSize={PAGE_SIZE}
          doctorSlug={doctor.slug}
          key={doctor.slug}
        />
      )}
    </section>
  );
}

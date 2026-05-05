import Image from "next/image";
import Link from "next/link";
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
      <Link
        href="/doctors"
        className="inline-flex items-center gap-1 text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)]"
      >
        ← 전문의 목록
      </Link>

      {/* 원장님 hero */}
      <header className="grid grid-cols-[1fr_120px] items-stretch gap-5 sm:grid-cols-[1fr_180px] sm:gap-8">
        <div className="flex flex-col justify-between space-y-3 py-2">
          {doctor.intro && (
            <p className="whitespace-pre-line text-[15px] leading-[1.6] text-[var(--text-secondary)] sm:text-[16px]">
              {doctor.intro}
            </p>
          )}
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              {doctor.name} 원장님
            </h1>
            <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)] sm:text-[14px]">
              {doctor.title} · {affiliation}
            </p>
          </div>
        </div>
        <div
          className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius)] sm:aspect-[3/4]"
          style={{ background: theme.bg }}
        >
          <Image
            src={photo}
            alt={`${doctor.name} 원장님`}
            fill
            sizes="(max-width: 600px) 120px, 180px"
            className="object-cover"
            style={{
              objectPosition: "50% 8%",
              transform: `translate(${theme.offsetX ?? 0}px, ${theme.offsetY ?? 0}px)`,
            }}
            priority
          />
        </div>
      </header>

      {/* Q&A 헤더 */}
      <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-5">
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

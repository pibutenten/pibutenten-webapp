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
      <header className="relative mx-auto w-full max-w-[820px]">
        <div className="flex items-end gap-1 sm:gap-2">
          {/* 좌측: 멘트(중상단) + 이름(하단) — 좌측 약간의 여백 */}
          <div className="flex flex-1 flex-col self-stretch pb-6 pl-2 pt-12 sm:pb-8 sm:pl-3 sm:pt-20">
            {doctor.intro && (
              <p className="text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]">
                {doctor.intro.replace(/\s*\n+\s*/g, " ")}
              </p>
            )}
            <div className="mt-auto pt-6">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {doctor.name}
              </h1>
              <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)] sm:text-[14px]">
                {affiliation}
              </p>
            </div>
          </div>

          {/* 우측: 누끼 사진 — 약간 우측으로 */}
          <div className="relative h-[280px] w-[190px] shrink-0 translate-x-1 sm:h-[400px] sm:w-[300px] sm:translate-x-2">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="(max-width: 600px) 190px, 300px"
              className="object-contain object-bottom"
              priority
            />
          </div>
        </div>

        {/* 하단 페이드아웃 라인 — 양끝 투명 → 가운데 옅은 회색 */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.10) 18%, rgba(0,0,0,0.10) 82%, transparent 100%)",
          }}
        />
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

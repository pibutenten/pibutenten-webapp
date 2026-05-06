import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorPhoto } from "@/lib/doctor-theme";
import { getHotQaIds } from "@/lib/hot-ids";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import ArticleCard from "@/components/ArticleCard";
import { loadDoctorArticles } from "@/lib/article/load";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Props = {
  params: Promise<{ slug: string }>;
};

/** 원장님 페이지 공유 시 OG 메타 — /public/og/{slug}.png 우선, 없으면 기본 og.png */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("name, title, clinic, intro")
    .eq("slug", slug)
    .maybeSingle()
    .returns<{ name: string; title: string; clinic: string; intro: string | null }>();
  if (!doctor) return {};
  const ogImage = `/og/${slug}.png`;
  const title = `${doctor.name} ${doctor.title} · ${doctor.clinic}`;
  const description =
    doctor.intro?.trim() ||
    `${doctor.name} ${doctor.title}의 피부 Q&A와 칼럼을 만나보세요. 피부텐텐.`;
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: doctor.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

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

  // RPC로 가져와서 검색어 없을 때도 ±14일 랜덤 셔플 (홈 피드와 동일)
  const rpcRes = await supabase.rpc("search_qas_scored", {
    p_q: "",
    p_doctor_slug: doctor.slug,
    p_offset: 0,
    p_limit: PAGE_SIZE,
    p_boost_doctor_slug: null,
  });
  const qas = (rpcRes.data ?? []) as QACardData[];
  // 카운트는 별도 쿼리
  const cRes = await supabase
    .from("qas")
    .select("id", { count: "exact", head: true })
    .eq("published", true)
    .eq("doctor_id", doctor.id);
  const count = cRes.count ?? null;

  const photo = getDoctorPhoto(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");
  const hotIds = Array.from(await getHotQaIds(20));

  // 원장 칼럼 (article)
  const articles = await loadDoctorArticles(supabase, doctor.id, 6);

  return (
    <section className="space-y-6">
      {/* 원장님 hero — 모바일에선 양옆/위 main padding 상쇄해서 viewport 가장자리까지 가득 */}
      <header className="relative -mx-4 -mt-6 w-[calc(100%+2rem)] overflow-hidden sm:mx-0 sm:-mt-4 sm:w-full sm:rounded-t-[var(--radius)]">
        <div className="mx-auto flex max-w-[820px] items-end gap-2 pl-5 pr-3 sm:gap-3 sm:pl-5 sm:pr-3">
          {/* 좌측: 멘트(중상단) + 이름(하단) — 좌측 여백은 부모 px-4로 일관 */}
          <div className="flex flex-1 flex-col self-stretch pb-5 pt-10 sm:pb-8 sm:pt-16">
            {doctor.intro && (
              <>
                {/* 모바일: \n 무시하고 페이지 폭에 맞춰 자동 wrap */}
                <p className="block text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:hidden">
                  {doctor.intro.replace(/\s*\n+\s*/g, " ")}
                </p>
                {/* 데스크탑: 입력된 \n 줄바꿈 그대로 유지 */}
                <p className="hidden whitespace-pre-line text-[16px] leading-[1.7] text-[var(--text-secondary)] sm:block">
                  {doctor.intro}
                </p>
              </>
            )}
            <div className="mt-auto pt-5">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                {doctor.name}
              </h1>
              <p className="mt-1 text-[13px] font-medium text-[var(--text-secondary)] sm:text-[14px]">
                {affiliation}
              </p>
            </div>
          </div>

          {/* 우측: 누끼 사진 — 모바일도 시원하게, 우측 가장자리 안쪽으로 (translate 제거) */}
          <div className="relative h-[270px] w-[195px] shrink-0 sm:h-[360px] sm:w-[270px]">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="(max-width: 600px) 195px, 270px"
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

      {/* 원장 칼럼 (article) — 있을 때만 표시 */}
      {articles.length > 0 && (
        <div className="pt-2">
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">
            {doctor.name} 원장님의 칼럼{" "}
            <span className="text-[14px] font-medium text-[var(--text-muted)]">
              {articles.length}편
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </div>
      )}

      {/* Q&A 헤더 */}
      <h2 className="pt-2 text-lg font-bold text-[var(--text)]">
        {doctor.name} 원장님의 Q&A{" "}
        <span className="text-[14px] font-medium text-[var(--text-muted)]">
          {count ?? 0}개
        </span>
      </h2>

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
          hotIds={hotIds}
          key={doctor.slug}
        />
      )}
    </section>
  );
}

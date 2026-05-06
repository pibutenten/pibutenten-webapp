import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import { getHotQaIds } from "@/lib/hot-ids";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

async function fetchQa(id: string): Promise<QACardData | null> {
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords, type, created_at,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      author:profiles!qas_author_id_fkey(id, display_name, avatar_url),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("id", numId)
    .eq("status", "published")
    .maybeSingle()
    .returns<QACardData>();
  return data;
}

/** 단일 Q&A 메타 — 공유 시 카드 미리보기 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const qa = await fetchQa(id);
  if (!qa) return { title: "피부텐텐" };
  const docName = qa.doctor?.name ? `${qa.doctor.name} 원장님` : "피부텐텐";
  // 답변 앞부분 100자로 description
  const desc = (qa.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
  // 원장별 미리 제작된 OG PNG 직접 사용 (satori 합성 안 거침)
  const ogUrl = qa.doctor?.slug
    ? `/og/${qa.doctor.slug}.png`
    : `/og.png`;
  return {
    title: qa.question,
    description: desc,
    openGraph: {
      title: qa.question,
      description: `${docName} — ${desc}`,
      type: "article",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: docName }],
    },
    twitter: {
      card: "summary_large_image",
      title: qa.question,
      description: `${docName} — ${desc}`,
      images: [ogUrl],
    },
  };
}

export default async function SingleQaPage({ params }: Props) {
  const { id } = await params;
  const qa = await fetchQa(id);
  if (!qa) notFound();
  const hotIds = Array.from(await getHotQaIds(20));

  return (
    <section className="mx-auto w-full max-w-[680px]">
      <QACard qa={qa} isHot={hotIds.includes(qa.id)} />
    </section>
  );
}

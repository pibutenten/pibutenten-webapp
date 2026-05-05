import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
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
      id, question, answer, meta, keywords,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("id", numId)
    .eq("published", true)
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
  return {
    title: qa.question,
    description: desc,
    openGraph: {
      title: qa.question,
      description: `${docName} — ${desc}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: qa.question,
      description: `${docName} — ${desc}`,
    },
  };
}

export default async function SingleQaPage({ params }: Props) {
  const { id } = await params;
  const qa = await fetchQa(id);
  if (!qa) notFound();
  const hotIds = Array.from(await getHotQaIds(20));

  return (
    <section className="mx-auto w-full max-w-[680px] space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
      >
        ← 홈으로
      </Link>
      <QACard qa={qa} isHot={hotIds.includes(qa.id)} />
    </section>
  );
}

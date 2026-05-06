import type { Metadata } from "next";
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
  try {
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
  } catch {
    // 네트워크 / RLS / 알 수 없는 오류 → null 반환 (graceful degrade)
    return null;
  }
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
  // 글이 없거나 접근 불가 → 404 대신 친근한 안내 페이지 노출
  if (!qa) {
    return (
      <section className="mx-auto w-full max-w-[480px] py-10">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
          <div className="mb-4 text-5xl">📭</div>
          <h1 className="mb-2 text-lg font-bold text-[var(--text)]">
            글을 찾을 수 없어요
          </h1>
          <p className="mb-6 text-sm leading-[1.6] text-[var(--text-secondary)]">
            글이 삭제되었거나 비공개로 전환되었을 수 있어요.
            <br />
            피드에서 다른 좋은 글을 둘러보세요.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
            >
              피드로 가기
            </Link>
            <Link
              href="/doctors"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              전문의 둘러보기
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const hotIds = Array.from(await getHotQaIds(20));

  return (
    <section className="mx-auto w-full max-w-[680px]">
      <QACard qa={qa} isHot={hotIds.includes(qa.id)} />
    </section>
  );
}

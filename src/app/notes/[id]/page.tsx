import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DiaryDetailView, { type DiaryDetail } from "@/components/skin/record/DiaryDetailView";

// BottomNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술 기록",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

// 상세 1건 — 부모 diary + 자식 procedures(가격·메모 포함). RLS 가 본인 소유분만 반환.
type DetailRow = DiaryDetail;

// /notes/[id] — 시술노트 상세(비공개). 로그인 필수. 본인 명함 소유분만 RLS 로 노출.
export default async function DiaryDetailPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/notes/${id}`);

  // diary_procedures(자식) + 이 방문(visit_id)에 연결된 내 후기(procedure_reviews) 동시 조회.
  //   후기는 procedure_reviews.visit_id=diaries.id 로 연결(마이그 0292). RLS read_own 으로 본인 후기만.
  //   각 후기의 review_checkin(timepoint)도 함께 가져온다 → 시술 경과(당일/1주/1달/4달) 입력 현황 표시·진입.
  //   ↳ 2c: diary_procedures 에 id 추가(FK 판정 앵커), linked_reviews 에 diary_procedure_id +
  //     후기 카드 shortcode(card:cards) 추가 → 시술별 '이미 씀' 판정·'보기/수정' 링크에 사용.
  const { data: d } = await supabase
    .from("diaries")
    .select(
      "id, visited_on, clinic_name, clinic_addr, clinic_tel, doctor_name, manager_name, diary_body, source, diary_procedures(id, procedure_ko, unit_text, price, note, sort_order), linked_reviews:procedure_reviews!procedure_reviews_visit_id_fkey(id, procedure_ko, diary_procedure_id, card:cards(shortcode), review_checkin(timepoint))",
    )
    .eq("id", numId)
    .maybeSingle()
    .returns<DetailRow>();

  if (!d) notFound(); // 없거나 RLS 로 막힌(타인 소유) 경우 모두 404.

  return <DiaryDetailView diary={d} />;
}

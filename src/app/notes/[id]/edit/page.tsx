import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewProcedures } from "@/lib/review-procedures";
import DiaryEditView from "./DiaryEditView";
import type { MemberInitial } from "@/components/skin/record/SkinDiaryForms";

// AppShell·DiaryForm 이 클라이언트 훅 사용 → 동적 렌더(비공개·noindex).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술 기록 수정",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

/** 편집 초기값 구성용 조회 행 — /notes/[id] 상세 SELECT 에 병원 스냅샷(addr·x·y)·시술 가격 확장. */
type EditRow = {
  id: number;
  visited_on: string | null;
  source: "member" | "clinic";
  clinic_name: string | null;
  clinic_addr: string | null;
  clinic_tel: string | null;
  clinic_x: number | null;
  clinic_y: number | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  total_price: number | null;
  diary_procedures: {
    procedure_ko: string;
    unit_text: string | null;
    price: number | null;
    note: string | null;
    sort_order: number;
  }[];
};

/**
 * /notes/[id]/edit — 회원 시술노트 편집(C4, 비공개·로그인 필수).
 *
 * 서버가 그 diary 를 본인 소유로 조회(RLS)해 편집 초기값(MemberInitial)을 구성 →
 * DiaryEditView(→ DiaryForm memberEditVisitId)로 전달. 타 소유·미존재는 notFound.
 * 시술 자동완성 사전은 작성 폼과 동일 소스(getReviewProcedures).
 */
export default async function DiaryEditPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/notes/${id}/edit`);

  const [{ data: d }, procedures] = await Promise.all([
    supabase
      .from("diaries")
      .select(
        "id, visited_on, source, clinic_name, clinic_addr, clinic_tel, clinic_x, clinic_y, doctor_name, manager_name, diary_body, total_price, diary_procedures(procedure_ko, unit_text, price, note, sort_order)",
      )
      .eq("id", numId)
      .maybeSingle()
      .returns<EditRow>(),
    getReviewProcedures(supabase),
  ]);

  if (!d) notFound(); // 없거나 RLS 로 막힌(타인 소유) 경우 모두 404.

  const initial: MemberInitial = {
    visited_on: d.visited_on,
    source: d.source,
    procedures: [...d.diary_procedures]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pr) => ({
        procedure_ko: pr.procedure_ko,
        note: pr.note,
        unit_text: pr.unit_text,
        price: pr.price,
      })),
    clinic_name: d.clinic_name,
    clinic_addr: d.clinic_addr,
    clinic_tel: d.clinic_tel,
    clinic_x: d.clinic_x,
    clinic_y: d.clinic_y,
    doctor_name: d.doctor_name,
    manager_name: d.manager_name,
    diary_body: d.diary_body,
    total_price: d.total_price,
  };

  return <DiaryEditView visitId={numId} initial={initial} procedures={procedures} />;
}

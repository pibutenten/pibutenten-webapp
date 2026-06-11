import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RecordTab from "./RecordTab";
import type { SummaryGroup, SummaryItem } from "../mockups/skin-diary/SkinDiaryMockup";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 일기",
  robots: { index: false, follow: false },
};

// diaries(부모) + diary_procedures(자식 N) 조인 행. RLS 가 active 명함 소유분만 반환.
type DiaryRow = {
  id: number;
  visited_on: string; // "YYYY-MM-DD"
  clinic_name: string | null;
  clinic_tel: string | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  diary_procedures: {
    procedure_ko: string;
    unit_text: string | null;
    price: number | null;
    sort_order: number;
  }[];
};

// diaries 행 → 내 일기 패널이 쓰는 SummaryGroup[](연도 내림차순, 같은 해는 최신 방문순).
function toSummaryGroups(rows: DiaryRow[]): SummaryGroup[] {
  const byYear = new Map<number, SummaryItem[]>();
  for (const r of rows) {
    const [y, m, d] = r.visited_on.split("-");
    const year = Number(y);
    const procs = [...r.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
    const items = procs.map((p) => ({ name: p.procedure_ko, unit: p.unit_text ?? "" }));
    const totalPrice = procs.reduce((s, p) => s + (p.price ?? 0), 0);
    const hasPrice = procs.some((p) => p.price != null);
    const item: SummaryItem = {
      id: String(r.id),
      date: `${m}.${d}`,
      proc: items.map((i) => i.name).join(" · "),
      hospital: r.clinic_name ?? "병원 미입력",
      doctor: r.doctor_name ?? "",
      manager: r.manager_name ?? undefined,
      tel: r.clinic_tel ?? "",
      price: hasPrice ? `${totalPrice.toLocaleString("ko-KR")}원` : "",
      memo: r.diary_body ?? "",
      items,
    };
    byYear.set(year, [...(byYear.get(year) ?? []), item]);
  }
  // 연도 내림차순 + 같은 해는 날짜("MM.DD") 내림차순 명시 정렬(쿼리 order 의존 제거).
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      items: [...items].sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

// /record — 내 일기(비공개). 로그인 필수. 서버에서 active 명함 diaries 를 조회·변환해 전달.
export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("diaries")
    .select(
      "id, visited_on, clinic_name, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, sort_order)",
    )
    .order("visited_on", { ascending: false })
    .returns<DiaryRow[]>();

  return <RecordTab summary={toSummaryGroups(data ?? [])} />;
}

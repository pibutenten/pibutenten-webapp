import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
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

  // 인사용 이름 — active 명함 표시명(없으면 '회원').
  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", activeId)
    .maybeSingle()
    .returns<{ display_name: string | null }>();
  const userName = prof?.display_name?.trim() || "회원";

  const { data } = await supabase
    .from("diaries")
    .select(
      "id, visited_on, clinic_name, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, sort_order)",
    )
    .order("visited_on", { ascending: false })
    .returns<DiaryRow[]>();

  const rows = data ?? [];
  // 상태 문구 계산용 — 가장 최근 방문의 첫 시술명 + 방문일 + 그 시술 누적 횟수('N회차').
  const latestRow = rows[0];
  const latestName =
    latestRow &&
    ([...latestRow.diary_procedures].sort((a, b) => a.sort_order - b.sort_order)[0]?.procedure_ko ??
      "시술");
  const latest = latestRow
    ? {
        name: latestName as string,
        visitedOn: latestRow.visited_on,
        count: rows.filter((r) => r.diary_procedures.some((p) => p.procedure_ko === latestName))
          .length,
      }
    : null;

  return <RecordTab summary={toSummaryGroups(rows)} userName={userName} latest={latest} />;
}

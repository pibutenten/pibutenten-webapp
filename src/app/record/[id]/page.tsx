import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술 기록",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

// 상세 1건 — 부모 diary + 자식 procedures(가격·메모 포함). RLS 가 본인 소유분만 반환.
type DetailRow = {
  id: number;
  visited_on: string; // "YYYY-MM-DD"
  clinic_name: string | null;
  clinic_addr: string | null;
  clinic_tel: string | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  diary_procedures: {
    procedure_ko: string;
    unit_text: string | null;
    price: number | null;
    note: string | null;
    sort_order: number;
  }[];
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const cardBox = "rounded-[var(--radius)] bg-white p-5";

// /record/[id] — 시술노트 상세(비공개). 로그인 필수. 본인 명함 소유분만 RLS 로 노출.
export default async function DiaryDetailPage({ params }: Props) {
  const { id } = await params;
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/record/${id}`);

  const { data: d } = await supabase
    .from("diaries")
    .select(
      "id, visited_on, clinic_name, clinic_addr, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, note, sort_order)",
    )
    .eq("id", numId)
    .maybeSingle()
    .returns<DetailRow>();

  if (!d) notFound(); // 없거나 RLS 로 막힌(타인 소유) 경우 모두 404.

  const [y, m, day] = d.visited_on.split("-");
  const weekday = DOW[new Date(`${d.visited_on}T00:00:00`).getDay()];
  const procs = [...d.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
  const procTitle = procs.map((p) => p.procedure_ko).join(" · ") || "시술 기록";
  const medics = [d.doctor_name ? `${d.doctor_name} 원장님` : null, d.manager_name ? `${d.manager_name} 실장님` : null]
    .filter(Boolean)
    .join(" · ");
  const mapName = d.clinic_name ? encodeURIComponent(d.clinic_name) : "";

  return (
    <section className="mx-auto w-full max-w-[680px] space-y-3">
      {/* 헤더 — 날짜·시술·병원·의료진 + 빠른 액션 */}
      <div className={cardBox}>
        <p className="text-[12px] font-bold text-[var(--primary-active)]">
          {y}.{m}.{day} · {weekday}요일
          <span className="ml-1 font-medium text-[var(--text-muted)]">· 나만 봐요</span>
        </p>
        <p className="mt-1 text-[20px] font-bold text-[var(--text)]">{procTitle}</p>
        {d.clinic_name && <p className="mt-2 text-[14px] font-semibold text-[var(--text)]">{d.clinic_name}</p>}
        {medics && <p className="text-[13px] text-[var(--text-secondary)]">{medics}</p>}
        {(d.clinic_tel || d.clinic_name) && (
          <div className="mt-3 flex gap-2">
            {d.clinic_tel && (
              <a href={`tel:${d.clinic_tel}`} className="flex flex-1 items-center justify-center rounded-md bg-[var(--primary-soft)] py-2.5 text-[12.5px] font-semibold text-[var(--primary-active)]">
                전화하기
              </a>
            )}
            {d.clinic_name && (
              <a href={`https://map.naver.com/p/search/${mapName}`} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#03C75A] ring-1 ring-inset ring-[var(--border)]">
                네이버 지도
              </a>
            )}
            {d.clinic_name && (
              <a href={`tmap://search?name=${mapName}`} rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white py-2.5 text-[12.5px] font-semibold text-[#1A56DB] ring-1 ring-inset ring-[var(--border)]">
                티맵
              </a>
            )}
          </div>
        )}
        {d.clinic_addr && <p className="mt-2 text-[12px] text-[var(--text-muted)]">{d.clinic_addr}</p>}
      </div>

      {/* 받은 시술 — 시술명 · 용량 · 가격 · 메모 */}
      {procs.length > 0 && (
        <div className={cardBox + " space-y-2"}>
          {procs.map((p, i) => (
            <div key={i} className="rounded-md bg-[var(--bg)] p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-bold text-[var(--primary-active)]">
                  {p.procedure_ko}
                  {p.unit_text && <span className="ml-1 text-[12.5px] font-medium text-[var(--text-secondary)]">{p.unit_text}</span>}
                </span>
                {p.price != null && <span className="text-[13px] font-semibold text-[var(--text)]">{p.price.toLocaleString("ko-KR")}원</span>}
              </div>
              {p.note && <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{p.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* 오늘의 시술 노트(비공개 메모) */}
      {d.diary_body && (
        <div className={cardBox}>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{d.diary_body}</p>
        </div>
      )}

      <Link href="/record" className="block w-full rounded-md bg-[var(--bg)] py-2.5 text-center text-[12.5px] font-semibold text-[var(--text-secondary)]">
        ← 내 노트로
      </Link>
    </section>
  );
}

"use client";

/**
 * DiaryDetailView — /notes/[id] 시술 기록 상세 페이지 본문(클라이언트).
 *   공용 셸(BetaSkinShell, active="내 노트") 안에
 *   detailHead(뒤로가기 /notes + svg + h1 "시술 기록") + 기존 카드/버튼/텍스트 구조.
 *   DB 조회·권한·notFound 가드는 서버 page.tsx 가 담당하고, 여기선 조회 결과(diary)를
 *   props 로 받아 표시용 가공(날짜·시술 제목·의료진·지도 링크)만 수행해 렌더한다.
 */

import Link from "next/link";
import BetaSkinShell from "../BetaSkinShell";
import styles from "../beta-skin.module.css";

// 서버 page.tsx 의 DetailRow 와 동일 구조(조회 결과 1건).
export type DiaryDetail = {
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

export default function DiaryDetailView({ diary: d }: { diary: DiaryDetail }) {
  const [y, m, day] = d.visited_on.split("-");
  const weekday = DOW[new Date(`${d.visited_on}T00:00:00`).getDay()];
  const procs = [...d.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
  const procTitle = procs.map((p) => p.procedure_ko).join(" · ") || "시술 기록";
  const medics = [d.doctor_name ? `${d.doctor_name} 원장님` : null, d.manager_name ? `${d.manager_name} 실장님` : null]
    .filter(Boolean)
    .join(" · ");
  const mapName = d.clinic_name ? encodeURIComponent(d.clinic_name) : "";

  return (
    <BetaSkinShell active="내 노트">
      <div className={styles.detailHead}>
        <Link href="/notes" className={styles.detailBack} aria-label="내 노트로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className={styles.detailTitle}>시술 기록</h1>
      </div>

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
      </section>
    </BetaSkinShell>
  );
}

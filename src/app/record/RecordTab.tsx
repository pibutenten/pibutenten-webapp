"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecordView, type SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";
import { computeStatus, type DiaryLatest } from "@/lib/diary-status";
import Carousel from "./Carousel";

/* ── 리마인더 캐러셀 (데이터 공백분 더미 — 결정: 자리만 잡고 더미) ── */
const REMINDERS: {
  tag: string;
  tone: "amber" | "primary";
  title: string;
  sub: string;
  cta?: string;
  dday?: string;
}[] = [
  { tag: "⏰ 시술 주기 알림", tone: "amber", title: "스킨부스터 권장 주기가 다가왔어요", sub: "마지막 시술 후 8주 경과", cta: "예약하러 가기" },
  { tag: "📅 예정된 시술", tone: "primary", title: "쥬베룩 스킨부스터", sub: "2026.06.20 · 강남 피부과", dday: "D-5" },
];

/** 관심 키워드 새 글(Q&A) — 서버(/record/page.tsx)에서 회원 관심사 매칭으로 조회. */
export type QaItem = {
  id: number;
  title: string;
  snippet: string;
  keyword: string;
  doctorName: string;
  href: string;
};

export default function RecordTab({
  summary,
  userName,
  latest,
  qa,
}: {
  summary: SummaryGroup[];
  userName: string;
  latest: DiaryLatest | null;
  qa: QaItem[];
}) {
  const router = useRouter();
  const status = computeStatus(latest);

  // 월 요약 통계 — 모두 실데이터.
  const thisYear = new Date().getFullYear();
  const total = summary.reduce((n, g) => n + g.items.length, 0);
  const thisYearCount = summary.find((g) => g.year === thisYear)?.items.length ?? 0;
  const procFreq = new Map<string, number>();
  for (const g of summary)
    for (const it of g.items)
      for (const iv of it.items) procFreq.set(iv.name, (procFreq.get(iv.name) ?? 0) + 1);
  const topProc = [...procFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return (
    <div className="mx-auto max-w-[680px]">
      {/* ① 히어로 — 인사 + 경과 상태(그라데이션) */}
      <div
        className="relative overflow-hidden rounded-[var(--radius)] p-6 text-white"
        style={{ background: "linear-gradient(135deg, var(--primary) 0%, #5ED0FF 60%, #8FE0FF 100%)" }}
      >
        <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
        <span className="pointer-events-none absolute bottom-[-46px] right-6 h-28 w-28 rounded-full bg-white/10" />
        <p className="text-[14px] font-semibold opacity-90">안녕하세요, {userName}님 👋</p>
        <h1 className="mt-1.5 whitespace-pre-line text-[22px] font-extrabold leading-snug tracking-tight">
          {status.headline}
        </h1>
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed opacity-90">{status.sub}</p>
        <Link
          href="/write"
          className="relative z-[1] mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-3 text-[15px] font-extrabold text-[var(--primary-active)] shadow-[0_4px_14px_rgba(0,60,100,.18)]"
        >
          ✏️ {status.tappable ? "오늘 시술 기록하기" : latest ? "기록 이어쓰기" : "첫 기록 남기기"}
        </Link>
      </div>

      {/* ② 리마인더 캐러셀 */}
      <div className="mb-1 mt-7 flex items-baseline justify-between px-0.5">
        <h2 className="text-[19px] font-extrabold tracking-tight text-[var(--text)]">리마인더</h2>
        <span className="text-[13.5px] font-semibold text-[var(--primary-active)]">전체보기</span>
      </div>
      <Carousel className="-mx-1 mb-1 px-1 pb-2">
        {REMINDERS.map((r) => {
          const warm = r.tone === "amber";
          return (
            <div
              key={r.tag}
              className="min-w-[268px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px] shadow-[0_2px_12px_rgba(27,43,58,.06)]"
              style={{ scrollSnapAlign: "start" }}
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                style={warm ? { background: "#FFF4E5", color: "#C97A1B" } : { background: "var(--primary-soft)", color: "var(--primary-active)" }}
              >
                {r.tag}
              </span>
              <h3 className="mb-1.5 mt-3 text-[16.5px] font-extrabold leading-snug tracking-tight text-[var(--text)]">{r.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{r.sub}</p>
              {r.dday && (
                <span className="mt-3 inline-block rounded-full bg-[var(--primary)] px-3 py-1.5 text-[13px] font-extrabold text-white">{r.dday}</span>
              )}
              {r.cta && (
                <button
                  type="button"
                  className="mt-3.5 w-full rounded-[14px] py-3 text-[14.5px] font-extrabold"
                  style={warm ? { background: "#FFF4E5", color: "#C97A1B" } : { background: "var(--primary-soft)", color: "var(--primary-active)" }}
                >
                  {r.cta} →
                </button>
              )}
            </div>
          );
        })}
      </Carousel>

      {/* ③ 월 요약 스트립 (실데이터) — 기록이 있을 때만 */}
      {total > 0 && (
        <div className="mb-1 mt-6 flex gap-2.5">
          {[
            { n: String(thisYearCount), l: "올해 기록", tone: "primary" as const },
            { n: String(total), l: "누적 기록", tone: "primary" as const },
            { n: topProc, l: "최다 시술", tone: "ink" as const },
          ].map((s) => (
            <div key={s.l} className="flex-1 rounded-2xl border border-[var(--border)] bg-white p-3.5 text-center shadow-[0_2px_12px_rgba(27,43,58,.06)]">
              <div
                className={"truncate text-[21px] font-extrabold " + (s.tone === "primary" ? "text-[var(--primary-active)]" : "text-[var(--text)]")}
                title={s.n}
              >
                {s.n}
              </div>
              <div className="mt-1 text-[12px] font-semibold text-[var(--text-secondary)]">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ④ 내 일기 — 타임라인/달력/목록 (시그니처 타임라인) */}
      <div className="mt-6">
        <RecordView go={() => {}} summary={summary} openDetail={(id) => router.push(`/record/${id}`)} />
      </div>

      {/* ⑤ 관심 키워드 새 글 — 회원 관심사 매칭 최근 Q&A (실데이터). 매칭 없으면 숨김. */}
      {qa.length > 0 && (
        <>
          <div className="mb-1 mt-8 px-0.5">
            <h2 className="text-[19px] font-extrabold tracking-tight text-[var(--text)]">관심 키워드 새 글</h2>
          </div>
          <Carousel className="-mx-1 px-1 pb-2">
            {qa.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block min-w-[268px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px] shadow-[0_2px_12px_rgba(27,43,58,.06)] transition-colors hover:border-[var(--primary)]"
                style={{ scrollSnapAlign: "start" }}
              >
                {item.keyword && (
                  <span className="inline-block rounded-full bg-[var(--primary-soft)] px-3 py-1 text-[12px] font-bold text-[var(--primary-active)]">{item.keyword}</span>
                )}
                <p className="mt-2.5 line-clamp-2 text-[14px] font-extrabold leading-snug text-[var(--text)]">Q. {item.title}</p>
                {item.snippet && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{item.snippet}</p>}
                {item.doctorName && <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[12px] font-bold text-[var(--text-secondary)]">{item.doctorName}</div>}
              </Link>
            ))}
          </Carousel>
        </>
      )}
    </div>
  );
}

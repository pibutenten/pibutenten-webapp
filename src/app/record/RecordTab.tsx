"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecordView, type SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";
import { computeStatus, type DiaryLatest } from "@/lib/diary-status";
import KeywordCarousel, { type KeywordPost } from "./KeywordCarousel";

/** 인기글 1건. */
export type PopularItem = {
  rank: number;
  title: string;
  authorName: string;
  type: string; // cards.category
  views: number;
  href: string;
};
export type PopularData = { d7: PopularItem[]; d30: PopularItem[]; d90: PopularItem[] };

// 글 타입(category) → 라벨.
const CAT_LABEL: Record<string, string> = { qa: "Q&A", review: "시술후기", doodle: "끄적끄적", review_summary: "리포트" };
const catLabel = (c: string) => CAT_LABEL[c] ?? "글";

// 순위 색 — 1핑크 / 2하늘 / 3골드 / 4+ 회색.
const rankColor = (r: number) => (r === 1 ? "#F76D9B" : r === 2 ? "var(--primary-active)" : r === 3 ? "#F5A623" : "var(--text-muted)");

function PopRow({ it }: { it: PopularItem }) {
  return (
    <Link href={it.href} className="flex items-center gap-3 border-b border-[var(--border)] py-3 last:border-0">
      <span className="min-w-[20px] shrink-0 text-center font-extrabold italic" style={{ color: rankColor(it.rank), fontSize: it.rank === 1 ? 18 : 16 }}>{it.rank}</span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14.5px] font-bold tracking-tight text-[var(--text)]">{it.title}</h3>
        <p className="mt-0.5 text-[11.5px] font-semibold text-[var(--text-muted)]">{it.authorName} · {catLabel(it.type)}</p>
      </div>
    </Link>
  );
}

export default function RecordTab({
  summary,
  userName,
  latest,
  diaryCount,
  reviewsCount,
  keywordPosts,
  popular,
  myKeywords,
}: {
  summary: SummaryGroup[];
  userName: string;
  latest: DiaryLatest | null;
  diaryCount: number;
  reviewsCount: number;
  keywordPosts: KeywordPost[];
  popular: PopularData;
  myKeywords: string[];
}) {
  const router = useRouter();
  const status = computeStatus(latest);
  const [period, setPeriod] = useState<keyof PopularData>("d7");
  const [popExpanded, setPopExpanded] = useState(false);

  // 최다 시술 — 일기 기준 가장 많이 기록된 시술명.
  const procFreq = new Map<string, number>();
  for (const g of summary) for (const it of g.items) for (const iv of it.items) procFreq.set(iv.name, (procFreq.get(iv.name) ?? 0) + 1);
  const topProc = [...procFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const scrollToDiary = () => document.getElementById("record-diary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const popItems = popular[period];
  const popTop = popItems.slice(0, 5);
  const popRest = popItems.slice(5);
  const changePeriod = (k: keyof PopularData) => {
    setPeriod(k);
    setPopExpanded(false);
  };

  return (
    <div className="mx-auto max-w-[680px]">
      {/* ① 히어로 — 인사 + 경과 상태 + 3버튼 */}
      <div
        className="relative overflow-hidden rounded-[var(--radius)] p-6 text-white"
        style={{ background: "linear-gradient(135deg, var(--primary) 0%, #5ED0FF 60%, #8FE0FF 100%)" }}
      >
        <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
        <span className="pointer-events-none absolute bottom-[-46px] right-6 h-28 w-28 rounded-full bg-white/10" />
        <p className="text-[14px] font-semibold opacity-90">안녕하세요, {userName}님 👋</p>
        <h1 className="mt-1.5 whitespace-pre-line text-[22px] font-extrabold leading-snug tracking-tight">{status.headline}</h1>
        <p className="mt-2 text-[13.5px] font-medium leading-relaxed opacity-90">{status.sub}</p>
        <div className="relative z-[1] mt-5">
          <button
            type="button"
            onClick={scrollToDiary}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[16px] font-extrabold text-[var(--text)] shadow-[0_5px_16px_rgba(0,70,110,.18)]"
          >
            📖 내 일기 보기
          </button>
          <div className="mt-2.5 flex gap-2.5">
            <Link
              href="/write"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] py-3 text-[14px] font-bold text-white"
              style={{ background: "rgba(255,255,255,.22)", borderColor: "rgba(255,255,255,.65)" }}
            >
              ✏️ 오늘 시술 기록하기
            </Link>
            <Link
              href="/write?tab=review"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] py-3 text-[14px] font-bold text-white"
              style={{ background: "rgba(255,255,255,.22)", borderColor: "rgba(255,255,255,.65)" }}
            >
              ⭐ 시술 후기 남기기
            </Link>
          </div>
        </div>
      </div>

      {/* ② 리마인더 — v2 에서 렌더 비활성화(데이터·코드는 추후 재활성화). */}

      {/* ③ 카운팅 대시보드 */}
      <div className="mb-1 mt-[18px] flex gap-2.5">
        {[
          { n: String(diaryCount), l: "내가 쓴 일기", txt: false },
          { n: String(reviewsCount), l: "내가 쓴 후기", txt: false },
          { n: topProc, l: "최다 시술", txt: true },
        ].map((s) => (
          <div key={s.l} className="flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px] text-center shadow-[0_2px_10px_rgba(34,43,53,.05)]">
            <div
              className={"truncate font-extrabold leading-tight " + (s.txt ? "text-[19px] text-[var(--text)]" : "text-[25px] text-[var(--primary-active)]")}
              title={s.n}
            >
              {s.n}
            </div>
            <div className="mt-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ④ 내 일기 — 타임라인/달력(연달력)/목록 */}
      <div id="record-diary" className="mt-7 scroll-mt-20">
        <RecordView go={() => {}} summary={summary} openDetail={(id) => router.push(`/record/${id}`)} />
      </div>

      {/* ⑤ 관심 키워드 새 글 — 가로 카러셀(컴팩트 카드) */}
      <div className="mb-3 mt-8 flex items-center justify-between px-0.5">
        <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--text)]">관심 키워드 새 글</h2>
        {keywordPosts.length > 0 && <Link href="/" className="text-[13.5px] font-bold text-[var(--primary-active)]">전체보기</Link>}
      </div>
      {myKeywords.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-center text-[13.5px] text-[var(--text-secondary)] shadow-[0_2px_10px_rgba(34,43,53,.05)]">
          <p>관심 키워드를 등록하면 관련 새 글을 모아 보여드려요.</p>
          <Link href="/settings/profile" className="mt-3 inline-block rounded-full bg-[var(--primary)] px-5 py-2 text-[13px] font-semibold text-white">키워드 등록하기</Link>
        </div>
      ) : (
        <KeywordCarousel posts={keywordPosts} myKeywords={myKeywords} viewAllHref="/" />
      )}

      {/* ⑥ 인기글 — 기간 탭 + TOP5(+ 6~10위 접기), 조회수 표시 */}
      <div className="mb-3 mt-9 px-0.5">
        <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--text)]">인기글</h2>
      </div>
      <div className="mb-3.5 flex gap-1 rounded-full bg-[#E9F0F5] p-1">
        {([["d7", "7일"], ["d30", "30일"], ["d90", "90일"]] as [keyof PopularData, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => changePeriod(k)}
            className={"flex-1 rounded-full py-2 text-[14px] font-bold transition-colors " + (period === k ? "bg-white text-[var(--text)] shadow-[0_2px_8px_rgba(34,43,53,.10)]" : "text-[var(--text-muted)]")}
          >
            {label}
          </button>
        ))}
      </div>
      {popItems.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-center text-[13.5px] text-[var(--text-secondary)] shadow-[0_2px_10px_rgba(34,43,53,.05)]">
          이 기간엔 인기글이 아직 없어요.
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-4 shadow-[0_2px_10px_rgba(34,43,53,.05)]">
          {popTop.map((it) => (
            <PopRow key={it.rank} it={it} />
          ))}
          {popExpanded && popRest.map((it) => <PopRow key={it.rank} it={it} />)}
          {popItems.length > 5 && (
            <button
              type="button"
              onClick={() => setPopExpanded((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--border)] py-3 text-[13.5px] font-bold text-[var(--text-secondary)]"
            >
              {popExpanded ? "접기 ▲" : `6~${popItems.length}위 보기 ▼`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

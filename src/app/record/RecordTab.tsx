"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecordView, type SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";
import { computeStatus, type DiaryLatest } from "@/lib/diary-status";
import KeywordCarousel, { type KeywordPost } from "./KeywordCarousel";
import type { PopularData, PopularItem } from "@/lib/record-data";

// 인기글 타입은 record-data(SSOT)에서 정의 — 운영·베타 공용. 기존 import 경로 호환 위해 재노출.
export type { PopularItem, PopularData } from "@/lib/record-data";

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
  guest = false,
}: {
  summary: SummaryGroup[];
  userName: string;
  latest: DiaryLatest | null;
  diaryCount: number;
  reviewsCount: number;
  keywordPosts: KeywordPost[];
  popular: PopularData;
  myKeywords: string[];
  guest?: boolean;
}) {
  const router = useRouter();
  const status = computeStatus(latest);
  const [period, setPeriod] = useState<keyof PopularData>("d7");
  const [popExpanded, setPopExpanded] = useState(false);

  // 최다 시술 — 노트 기준 가장 많이 기록된 시술명.
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
      {/* ① 히어로 — 게스트는 가입 유도, 회원은 인사+경과+3버튼 */}
      {guest ? (
        <div
          className="relative overflow-hidden rounded-[var(--radius)] p-6 text-white"
          style={{ background: "linear-gradient(135deg, var(--primary) 0%, #5ED0FF 60%, #8FE0FF 100%)" }}
        >
          <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
          <span className="pointer-events-none absolute bottom-[-46px] right-6 h-28 w-28 rounded-full bg-white/10" />
          <p className="text-[14px] font-semibold opacity-90">내 시술노트 ✨</p>
          <h1 className="mt-1.5 whitespace-pre-line text-[22px] font-extrabold leading-snug tracking-tight">받은 시술을 기록하고{"\n"}경과를 한눈에 관리하세요</h1>
          <p className="mt-2 text-[13.5px] font-medium leading-relaxed opacity-90">병원·시술·다운타임·효과·재방문 주기까지. 가입하면 나만의 시술노트가 시작돼요.</p>
          <div className="relative z-[1] mt-5">
            <Link
              href="/signup"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[16px] font-extrabold text-[var(--text)] shadow-[0_5px_16px_rgba(0,70,110,.18)]"
            >
              가입하고 내 노트 시작하기
            </Link>
            <p className="mt-2.5 text-center text-[12.5px] font-medium opacity-90">이미 계정이 있으세요? <Link href="/login" className="font-bold underline">로그인</Link></p>
          </div>
        </div>
      ) : (
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
              📖 내 노트 보기
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
      )}

      {/* ② 리마인더 — v2 에서 렌더 비활성화(데이터·코드는 추후 재활성화). */}

      {/* ③ 카운팅 대시보드 — 게스트는 숨김(개인 데이터 없음) */}
      {!guest && (
        <div className="mb-1 mt-[18px] flex gap-2.5">
          {[
            { n: String(diaryCount), l: "내가 쓴 노트", txt: false },
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
      )}

      {/* ④ 내 노트 — 타임라인/달력(연달력)/목록. 게스트는 '예시' 라벨 + 클릭 시 가입 유도. */}
      <div id="record-diary" className="mt-7 scroll-mt-20">
        {guest && (
          <div className="mb-3 flex items-center gap-2 px-0.5">
            <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--text)]">이렇게 기록돼요</h2>
            <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">예시</span>
          </div>
        )}
        <RecordView go={() => {}} summary={summary} openDetail={(id) => router.push(guest ? "/signup" : `/record/${id}`)} />
      </div>

      {/* ⑤ 키워드 새 글 — 회원=관심 키워드 / 게스트=인기 키워드 예시. 가로 카러셀(컴팩트 카드) */}
      <div className="mb-3 mt-8 flex items-center justify-between px-0.5">
        <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--text)]">{guest ? "인기 키워드 새 글" : "관심 키워드 새 글"}</h2>
        {keywordPosts.length > 0 && <Link href="/" className="text-[13.5px] font-bold text-[var(--primary-active)]">전체보기</Link>}
      </div>
      {!guest && myKeywords.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 text-center text-[13.5px] text-[var(--text-secondary)] shadow-[0_2px_10px_rgba(34,43,53,.05)]">
          <p>관심 키워드를 등록하면 관련 새 글을 모아 보여드려요.</p>
          <Link href="/settings/profile" className="mt-3 inline-block rounded-full bg-[var(--primary)] px-5 py-2 text-[13px] font-semibold text-white">키워드 등록하기</Link>
        </div>
      ) : (
        <KeywordCarousel posts={keywordPosts} myKeywords={myKeywords} viewAllHref="/" guest={guest} />
      )}

      {/* ⑥ 인기글 — 회원 전용(사이트 통계 RPC는 로그인 필요). 게스트는 가입 CTA. */}
      {guest ? (
        <div className="mt-9 overflow-hidden rounded-[var(--radius)] bg-white p-6 text-center shadow-[0_2px_10px_rgba(34,43,53,.05)]">
          <p className="text-[16px] font-extrabold text-[var(--text)]">가입하면 더 많은 걸 볼 수 있어요</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">내 시술 기록·경과 관리, 관심 키워드 새 글, 인기글까지<br />피부텐텐과 함께 시작해보세요.</p>
          <Link href="/signup" className="mt-4 inline-block w-full rounded-full bg-[var(--primary)] py-3.5 text-[15px] font-extrabold text-white">가입하고 내 노트 시작하기</Link>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

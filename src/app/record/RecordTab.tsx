"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
// 우리 목업의 내 일기(연표/달력/목록) 컴포넌트를 그대로 재사용.
//   데이터는 서버(page.tsx)에서 조회한 실제 diaries(SummaryGroup[])를 prop 으로 받음.
//   항목 클릭 → /record/[id] 상세 라우트로 이동.
import { RecordView, type SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";

/* ════════════════ 상태 문구(시술 경과 단계) — Figma 시안 상태머신 이식 ════════════════
   마지막 시술명+방문일로 5단계 자동 판정. 시안 5종 + fallback(결정: 시안 5종+기본값). */
type ProcParams = { downtimeDays: number; onsetDays: number; cycleDays: number | null };
const PROC_PARAMS: { key: string; p: ProcParams }[] = [
  { key: "보톡스", p: { downtimeDays: 3, onsetDays: 7, cycleDays: 105 } },
  { key: "스킨부스터", p: { downtimeDays: 3, onsetDays: 28, cycleDays: 84 } },
  { key: "리프팅", p: { downtimeDays: 7, onsetDays: 56, cycleDays: 365 } },
  { key: "써마지", p: { downtimeDays: 7, onsetDays: 42, cycleDays: 365 } },
  { key: "스컬트라", p: { downtimeDays: 7, onsetDays: 42, cycleDays: 365 } },
];
const FALLBACK_PARAMS: ProcParams = { downtimeDays: 7, onsetDays: 28, cycleDays: null };

function paramsFor(name: string): ProcParams {
  const hit = PROC_PARAMS.find((x) => name.includes(x.key));
  return hit ? hit.p : FALLBACK_PARAMS;
}
const periodLabel = (days: number) => (days < 14 ? `${days}일차` : `${Math.floor(days / 7)}주차`);

function computeStatus(latest: { name: string; visitedOn: string } | null): {
  text: string;
  tappable: boolean;
} {
  if (!latest) return { text: "첫 시술 기록을 남겨보세요", tappable: true };
  const params = paramsFor(latest.name);
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(`${latest.visitedOn}T00:00:00`).getTime()) / 86_400_000),
  );
  if (elapsed <= params.downtimeDays)
    return { text: `${latest.name} 시술 ${periodLabel(elapsed)} · 오늘 경과를 남겨보세요`, tappable: true };
  if (elapsed <= params.onsetDays)
    return { text: `${latest.name} ${periodLabel(elapsed)} · 슬슬 효과가 나타날 시기예요`, tappable: false };
  if (params.cycleDays === null || elapsed <= params.cycleDays)
    return { text: `${latest.name} 받은 지 ${periodLabel(elapsed)} · 효과가 잘 유지되는 시기예요`, tappable: false };
  if (elapsed > params.cycleDays * 1.5)
    return { text: "자외선이 강해지는 계절이에요 ☀️", tappable: false };
  return { text: `${latest.name} 받은 지 ${periodLabel(elapsed)} · 효과가 잘 유지되는 시기예요`, tappable: false };
}

/* ════════════════ 리마인더 캐러셀 (데이터 공백분 더미 — 결정: 자리만 잡고 더미) ════════════════ */
const REMINDERS: {
  tag: string;
  tone: "amber" | "primary" | "violet";
  title: string;
  sub: string;
  cta?: string;
  dday?: string;
}[] = [
  { tag: "시술 주기 알림", tone: "amber", title: "스킨부스터 권장 주기가 다가왔어요", sub: "마지막 시술 후 8주 경과", cta: "예약하기" },
  { tag: "예정된 시술", tone: "primary", title: "쥬베룩 스킨부스터", sub: "2026.06.20 · 강남 피부과", dday: "D-5" },
  { tag: "맞춤 시술 제안", tone: "violet", title: "탄력 고민에 맞는 HIFU 리프팅은 어때요?", sub: "피부 프로필 기반 추천", cta: "자세히 보기" },
];

const TONE: Record<string, { chipBg: string; chipText: string; iconBg: string }> = {
  amber: { chipBg: "#FBEFD9", chipText: "#B6790F", iconBg: "#FBEFD9" },
  primary: { chipBg: "var(--primary-soft)", chipText: "var(--primary-active)", iconBg: "var(--primary-soft)" },
  violet: { chipBg: "#EEE9FB", chipText: "#6D54C7", iconBg: "#EEE9FB" },
};

/* ════════════════ 관심사 Q&A 캐러셀 (더미 — 자리만) ════════════════ */
const QA_DUMMY = [
  { tag: "#스킨부스터", q: "스킨부스터, 몇 주 간격으로 받는 게 좋나요?", a: "초기 3회를 2~4주 간격으로 받고, 이후 유지 관리는 2~3개월 주기가 일반적입니다.", doctor: "김민정 원장" },
  { tag: "#리프팅", q: "울쎄라와 써마지, 어떤 차이가 있나요?", a: "울쎄라는 초음파로 SMAS층을, 써마지는 고주파로 진피층을 자극합니다.", doctor: "박수연 원장" },
  { tag: "#레이저토닝", q: "레이저 토닝 후 자외선 차단이 그렇게 중요한가요?", a: "시술 후 피부가 민감해져 과색소 반응이 생길 수 있어 SPF50 이상을 권합니다.", doctor: "이지현 원장" },
];

export default function RecordTab({
  summary,
  userName,
  latest,
}: {
  summary: SummaryGroup[];
  userName: string;
  latest: { name: string; visitedOn: string } | null;
}) {
  const router = useRouter();
  const status = computeStatus(latest);

  return (
    <div className="mx-auto max-w-[680px] space-y-5">
      {/* ① 인사 + 상태 문구 카드 */}
      <div className="rounded-[var(--radius)] bg-[var(--bg-soft)] p-5">
        <p className="text-[15px] font-bold text-[var(--text)]">안녕하세요, {userName}님! 👋</p>
        <div className="mt-2">
          {status.tappable ? (
            <Link href="/write" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--primary-active)]">
              {status.text}
              <span aria-hidden>›</span>
            </Link>
          ) : (
            <span className="text-[12px] text-[var(--text-secondary)]">{status.text}</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/write" className="flex-1 rounded-md bg-[var(--primary)] py-2 text-center text-[12px] font-semibold text-white">
            시술 기록하기
          </Link>
        </div>
      </div>

      {/* ② 리마인더 캐러셀 (일부 더미) */}
      <section>
        <p className="mb-2 px-1 text-[13px] font-bold text-[var(--text)]">리마인더</p>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" style={{ scrollSnapType: "x mandatory" }}>
          {REMINDERS.map((r) => {
            const t = TONE[r.tone];
            return (
              <div key={r.tag} className="w-[260px] shrink-0 rounded-[var(--radius)] bg-white p-4" style={{ scrollSnapAlign: "start" }}>
                <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: t.chipBg, color: t.chipText }}>
                  {r.tag}
                </span>
                <p className="mt-2 text-[13px] font-semibold leading-snug text-[var(--text)]">{r.title}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{r.sub}</p>
                {r.dday && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-[11px] font-bold text-white">{r.dday}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">리마인드 ON</span>
                  </div>
                )}
                {r.cta && (
                  <button type="button" className="mt-3 w-full rounded-md py-2 text-[11px] font-semibold" style={{ background: t.chipBg, color: t.chipText }}>
                    {r.cta} →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ③ 시술 기록 — 기존 연표/달력/목록 유지 */}
      <RecordView go={() => {}} summary={summary} openDetail={(id) => router.push(`/record/${id}`)} />

      {/* ④ 내 관심사 Q&A 캐러셀 (더미) */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[13px] font-bold text-[var(--text)]">내 관심사 Q&amp;A</p>
          <Link href="/search" className="text-[12px] font-medium text-[var(--primary-active)]">전체보기</Link>
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" style={{ scrollSnapType: "x mandatory" }}>
          {QA_DUMMY.map((item) => (
            <div key={item.q} className="w-[260px] shrink-0 rounded-[var(--radius)] bg-white p-4" style={{ scrollSnapAlign: "start" }}>
              <span className="mb-2 inline-block rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary-active)]">{item.tag}</span>
              <p className="line-clamp-2 text-[12px] font-bold leading-snug text-[var(--text)]">Q. {item.q}</p>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{item.a}</p>
              <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] font-semibold text-[var(--text-secondary)]">{item.doctor}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

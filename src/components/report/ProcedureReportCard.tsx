"use client";

/**
 * ProcedureReportCard — 시술별 후기 집계 + 개별 후기를 담은 **단일 카드**(접힘 내장).
 *
 * 태그 검색 최상단/피드에 한 장의 카드로 삽입되도록 전체가 하나의 <article>.
 *   - 접힘(기본): 헤더 + 재시술 의향 + 만족도 + 통증 까지.
 *   - 펼침: 많이 본 효과 · 작성자 통계 · 면책 · 개별 후기(컴팩트) 까지.
 * 강조: 재시술 의향(상단, 만족도보다 살짝만) → 만족도. 후기는 좋아요/댓글/공유 없는 미니멀 목록.
 * 표본 적을 때 안내는 카드 밖 <ReportSampleNotice/> 가 카드 위에서 담당(컴포넌트 분리).
 */
import { useState } from "react";
import Link from "next/link";
import type { ProcedureReport } from "@/lib/procedure-report";
import type { CardData } from "@/components/Card";
import { categoryTheme } from "@/lib/procedure-theme";
import { DOWNTIME_OPTIONS, EFFECT_ONSET_OPTIONS } from "@/lib/review-options";
import { useSession } from "@/lib/session-context";
import type { EngagementMe } from "@/components/card/hooks/useCardEngagement";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import ReportReviewItem from "@/components/report/ReportReviewItem";
import ReportAnchorActions from "@/components/report/ReportAnchorActions";
import { getQaUrl } from "@/lib/card-url";

const PAIN_LABELS = ["없음", "조금", "보통", "꽤", "심함"];
const PAIN_SOFT = ["#BAE6FD", "#FDE68A", "#FDBA74", "#FCA5A5", "#F08A8A"];
const EFFECT_BAR_COLORS = [
  "#7FD0F8", "#B0A0DE", "#9AA6DE", "#FFCB8C", "#8FD4C8",
  "#F59CB6", "#A6D9A9", "#F4B8A0", "#C3B0E8", "#CDC97A",
];

// 집계 섹션 — 구분선 없이 여백(py-5)으로만 구분.
const SECTION = "px-5 py-5";
const TITLE = "mb-2.5 text-[15px] font-bold text-[var(--text)]";

// 다운타임·효과시기 5구간 분포 막대 색 — 차가운→따뜻한 순한 5색(순서=빠름→느림).
const DIST_BAR_COLORS = ["#7FD0F8", "#8FD4C8", "#A6D9A9", "#FFCB8C", "#F4B8A0"];

/* CompactDist — 5구간 단일선택 분포를 '얇은 단일 바 + 범례 한 줄대'로 표시(통증 톤).
   answered===0 이면 섹션 통째 숨김(빈 섹션·에러 방지). 다운타임·효과시기 공용. */
function CompactDist({
  headline,
  options,
  dist,
  answered,
}: {
  headline: string;
  options: { value: string; label: string }[];
  dist: number[];
  answered: number;
}) {
  if (answered === 0) return null;
  return (
    <section className={SECTION}>
      <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
        {headline}
      </p>
      <div className="flex h-[14px] overflow-hidden rounded-full">
        {dist.map((c, i) =>
          c > 0 ? (
            <div
              key={options[i].value}
              style={{ width: `${(c / answered) * 100}%`, backgroundColor: DIST_BAR_COLORS[i] }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        {options.map((o, i) =>
          dist[i] > 0 ? (
            <span key={o.value}>
              <i
                className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle"
                style={{ backgroundColor: DIST_BAR_COLORS[i] }}
              />
              {o.label} {dist[i]}명
            </span>
          ) : null,
        )}
      </div>
    </section>
  );
}

// 통계 수치를 편안한 자연어로 — 값에 따라 멘트가 달라진다.
function revisitPhrase(pct: number): string {
  if (pct >= 70) return `경험하신 분들의 ${pct}%가 다시 받고 싶어 해요.`;
  if (pct >= 40) return `${pct}%가 다시 받을 의향이 있어요. 호불호가 갈리는 편이에요.`;
  return `다시 받겠다는 분은 ${pct}%예요. 신중히 고민해 보세요.`;
}
function satisfactionPhrase(avg: number): string {
  const x = avg.toFixed(1);
  if (avg >= 4.5) return `만족도 ${x}점! 다들 결과에 크게 만족하셨어요.`;
  if (avg >= 4.0) return `만족도 ${x}점, 대체로 만족하는 분위기예요.`;
  if (avg >= 3.0) return `만족도 ${x}점, 기대와 결과가 갈리는 편이에요.`;
  return `만족도 ${x}점으로 아쉬웠다는 의견이 많아요.`;
}
function painPhrase(avg: number): string {
  const x = avg.toFixed(1);
  let desc: string;
  if (avg < 1.5) desc = "거의 안 아파요.";
  else if (avg < 2.5) desc = "살짝 따끔한 정도예요.";
  else if (avg < 3.5) desc = "참을 만해요.";
  else if (avg < 4.5) desc = "참을 만하지만 꽤 뻐근해요.";
  else desc = "꽤 아픈 편이라 마취가 필요해요.";
  return `통증 : 평균 ${x}점, ${desc}`;
}

export default function ProcedureReportCard({
  report,
  reviews = [],
  reviewLiked = {},
  defaultExpanded = false,
}: {
  report: ProcedureReport;
  reviews?: CardData[];
  /** 후기 id별 viewer 좋아요 여부(부모 페이지 prefetch). 비로그인이면 빈 객체. */
  reviewLiked?: Record<number, boolean>;
  /** 초기 펼침 여부. 단독 /reports 페이지=true, 검색·태그 삽입=false(접힘). */
  defaultExpanded?: boolean;
}) {
  const {
    procedureKo, en, anchor, category, count, avgSatisfaction, satisfactionDist,
    avgPain, revisit, effects, demographics,
    noEffectCount, downtimeAnswered, downtimeDist, onsetAnswered, onsetDist,
  } = report;
  // 단독 리포트 페이지 링크 = /reports/{en} (앵커 post_slug=en SSOT, getQaUrl 경유).
  const reportHref = getQaUrl({ id: anchor?.id ?? 0, type: "review_summary", post_slug: en });

  // 초기 펼침은 prop 으로만 결정 — sessionStorage 끌고다니기 제거(페이지 간 누수 원인).
  const [expanded, setExpanded] = useState(defaultExpanded);

  const satRounded = Math.round(avgSatisfaction);
  const maxSat = Math.max(1, ...satisfactionDist);
  const painPct = Math.min(100, Math.max(0, (avgPain / 5) * 100));
  const rTotal = Math.max(1, revisit.yes + revisit.maybe + revisit.no);
  const yesPct = Math.round((revisit.yes / rTotal) * 100);
  const maybePct = Math.round((revisit.maybe / rTotal) * 100);
  const noPct = Math.max(0, 100 - yesPct - maybePct);
  const topEffects = effects.slice(0, 6);
  // 최빈 구간 라벨(헤드라인용) — answered>0 일 때만 섹션이 렌더되므로 동률은 앞 구간(빠름) 우선.
  const dtTopLabel = DOWNTIME_OPTIONS[downtimeDist.indexOf(Math.max(...downtimeDist))]?.label ?? "";
  // 효과시기 = '언제부터 느끼기 시작'(onset). '아직 지켜보는 중'이 최빈이면 별도 문구.
  const onsetTop = EFFECT_ONSET_OPTIONS[onsetDist.indexOf(Math.max(...onsetDist))];
  const onsetHeadline =
    onsetTop?.value === "still_watching"
      ? "아직 효과를 지켜보는 분이 가장 많아요."
      : `효과는 대부분 ${onsetTop?.label ?? ""}부터 느끼기 시작했어요.`;
  const demoTotal = Math.max(1, demographics.male + demographics.female);
  const femalePct = Math.round((demographics.female / demoTotal) * 100);
  const malePct = Math.max(0, 100 - femalePct);
  const ageTotal = Math.max(1, demographics.ageBands.reduce((a, b) => a + b.count, 0));

  // 시술 분류별 테마(헤더 톤). 미발견(null)은 기본 파란 톤.
  const theme = categoryTheme(category);
  // 재시술 우세 판정 — yes >= no 면 '있어요' 우세, 아니면 '없어요' 우세.
  const yesDominant = revisit.yes >= revisit.no;
  const yesBarLabel = yesDominant ? "재시술 의향 있어요" : "있어요";
  const noBarLabel = yesDominant ? "없어요" : "재시술 의향 없어요";

  // 후기 목록 — 5개부터, '더보기'로 10씩 증가만. 카드 전체 접기 시 5 로 리셋.
  const [visibleCount, setVisibleCount] = useState(5);
  function expandCard() {
    setExpanded(true);
  }
  function collapseCard() {
    setExpanded(false);
    setVisibleCount(5);
  }

  // me — 단독 카드와 동일하게 SessionContext(SSR) 단일 출처. 비로그인 → null(즉시 모달).
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  // 비로그인 좋아요 클릭 시 띄울 모달 (Card.tsx 패턴).
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  return (
    <article className="overflow-hidden rounded-[var(--radius)] bg-white">
      {/* 헤더 칸 — 솔리드 틴트(분류색), 구분선 없음. 칸 전체가 단독 리포트 페이지 링크(펼침 상태). */}
      <header style={{ backgroundColor: theme.soft }} className="relative">
        <Link href={reportHref} className="block px-5 py-4">
          {/* eyebrow — 진한 본문색(시술명만 카테고리색) */}
          <div className="mb-1.5 text-[13px] font-bold tracking-tight text-[var(--text)]">
            피부텐텐 리포트
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: theme.color }}>
              {procedureKo}
            </h1>
            <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
              회원 후기 <b className="text-[var(--text)]">{count}건</b>
            </span>
          </div>
        </Link>
        {/* 저장·공유 — 박스 우상단 코너에 고정(absolute). Link 밖(중첩 방지). 앵커 없으면 미노출. */}
        {anchor && (
          <div className="absolute right-4 top-3.5">
            <ReportAnchorActions anchor={anchor} me={me} onLoginRequired={setAuthPrompt} />
          </div>
        )}
      </header>

      {/* 재시술 의향 — 상단, 만족도보다 살짝만 강조. 우세 세그먼트에만 '재시술 의향' 접두. */}
      <section className={SECTION}>
        <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
          {revisitPhrase(yesPct)}
        </p>
        <div className="flex h-[20px] overflow-hidden rounded-lg text-[11px] font-bold text-white">
          {yesPct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${yesPct}%`, backgroundColor: "#4CBFF2" }}>{yesPct >= (yesDominant ? 42 : 14) ? yesBarLabel : ""}</div>}
          {maybePct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${maybePct}%`, backgroundColor: "#9AA1AC" }}>{maybePct >= 12 ? "고민 중" : ""}</div>}
          {noPct > 0 && <div className="flex items-center justify-center overflow-hidden whitespace-nowrap" style={{ width: `${noPct}%`, backgroundColor: "#EA7E7B" }}>{noPct >= (yesDominant ? 14 : 42) ? noBarLabel : ""}</div>}
        </div>
        {/* 범례 — 맨 앞 리드 '재시술 의향', 고민 중은 maybe>0 일 때만. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
          <span className="text-[var(--text-muted)]">재시술 의향</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#4CBFF2" }} />있어요 {revisit.yes}명</span>
          {revisit.maybe > 0 && <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#9AA1AC" }} />고민 중 {revisit.maybe}명</span>}
          <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#EA7E7B" }} />없어요 {revisit.no}명</span>
        </div>
      </section>

      {/* 만족도 — 항상 테두리 있는 SECTION (접힘 마지막 노출은 아래 통증) */}
      <section className={SECTION}>
        <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
          {satisfactionPhrase(avgSatisfaction)}
        </p>
        <div className="flex items-center gap-4">
          {/* 별 아래에 점수(크게) — 별·점수 간격 살짝 */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <span className="text-[16px] leading-none tracking-[1px]">
              {[1, 2, 3, 4, 5].map((nn) => (
                <span key={nn} style={{ color: nn <= satRounded ? "var(--accent-save)" : "#DDE2E7" }}>★</span>
              ))}
            </span>
            <span className="text-[22px] font-extrabold leading-none text-[var(--text)]">{avgSatisfaction.toFixed(1)}</span>
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            {[5, 4, 3, 2, 1].map((score) => {
              const c = satisfactionDist[score - 1] ?? 0;
              return (
                <div key={score} className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
                  <span className="w-5 text-right">{score}</span>
                  <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                    <span className="block h-full rounded-full bg-[var(--accent-save)]" style={{ width: `${(c / maxSat) * 100}%` }} />
                  </span>
                  <span className="w-4 text-right">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 통증 — 접힘 시 마지막 노출 섹션(구분선 없음, 여백으로만 구분). */}
      <section className={SECTION}>
        <p className="mb-2.5 text-[14.5px] font-semibold leading-[1.45] text-[var(--text)]">
          {painPhrase(avgPain)}
        </p>
        <div className="relative h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PAIN_SOFT.join(", ")})` }}>
          <span className="absolute -top-[3px] h-[14px] w-[3px] rounded-[2px] bg-[#64748B] shadow-[0_0_0_2px_#fff]" style={{ left: `calc(${painPct}% - 1.5px)` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[9.5px] text-[var(--text-muted)]">
          {PAIN_LABELS.map((l) => <span key={l}>{l}</span>)}
        </div>
      </section>

      {/* ── 펼침 영역 ── */}
      {expanded && (
        <>
          {/* 일상 복귀(다운타임) — 통증 다음. answered===0 이면 숨김. */}
          <CompactDist
            headline={`일상 복귀까지 — 대부분 ${dtTopLabel}이었어요.`}
            options={DOWNTIME_OPTIONS}
            dist={downtimeDist}
            answered={downtimeAnswered}
          />

          {/* 많이 본 효과 */}
          {topEffects.length > 0 && (
            <section className={SECTION}>
              <div className={TITLE}>{procedureKo} 받은 분들이 느낀 효과예요.</div>
              <div className="flex flex-col gap-2.5">
                {topEffects.map((e, i) => (
                  <div key={e.label} className="flex items-center gap-2.5">
                    <span className="w-[52px] text-[12.5px] font-semibold text-[var(--text)]">{e.label}</span>
                    <span className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                      <span className="block h-full rounded-full" style={{ width: `${e.pct}%`, backgroundColor: EFFECT_BAR_COLORS[i % EFFECT_BAR_COLORS.length] }} />
                    </span>
                    <span className="w-10 text-right text-[12.5px] font-bold text-[var(--text-secondary)]">{e.pct}%</span>
                  </div>
                ))}
              </div>
              {/* 효과 '없음' — 효과 목록 아래 옅은 한 줄(쉽게 제거 가능). */}
              {noEffectCount > 0 && (
                <p className="mt-2.5 text-[12px] text-[var(--text-muted)]">
                  효과를 느끼지 못했다고 답한 분도 {noEffectCount}명 있었어요.
                </p>
              )}
            </section>
          )}

          {/* 효과시기(effect_onset) — 효과 다음. answered===0 이면 숨김. */}
          <CompactDist
            headline={onsetHeadline}
            options={EFFECT_ONSET_OPTIONS}
            dist={onsetDist}
            answered={onsetAnswered}
          />

          {/* 작성자 통계 — 약간의 차트(성별 막대 + 연령대 미니 바) */}
          {demoTotal > 0 && (
            <section className={SECTION}>
              <div className="mb-2.5 text-[15px] font-bold text-[var(--text)]">작성자 통계</div>

              {/* 성별 — 가로 막대 */}
              <div className="flex h-[14px] overflow-hidden rounded-full text-[9.5px] font-bold text-white">
                {femalePct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${femalePct}%`, backgroundColor: "#F59CB6" }}>
                    {femalePct >= 22 ? `여성 ${femalePct}%` : ""}
                  </div>
                )}
                {malePct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${malePct}%`, backgroundColor: "#7FD0F8" }}>
                    {malePct >= 22 ? `남성 ${malePct}%` : ""}
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-3.5 text-[11px] text-[var(--text-secondary)]">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#F59CB6" }} />여성 {femalePct}%</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-[3px] align-middle" style={{ backgroundColor: "#7FD0F8" }} />남성 {malePct}%</span>
              </div>

              {/* 연령대 — 미니 바 */}
              {demographics.ageBands.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {demographics.ageBands.map((b) => {
                    const pct = Math.round((b.count / ageTotal) * 100);
                    return (
                      <div key={b.label} className="flex items-center gap-2 text-[11px]">
                        <span className="w-9 text-[var(--text-secondary)]">{b.label}</span>
                        <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#EEF1F4]">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#9AA6DE" }} />
                        </span>
                        <span className="w-9 text-right font-semibold text-[var(--text-secondary)]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 면책 — 별도 박스 없이 작성자 통계 바로 아래 작은 회색 글씨 한 단락으로 녹임 */}
          <p className="px-5 pb-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
            이 리포트는 회원 후기 {count}건을 집계한 결과입니다. 개인차가 있으며 의학적
            효과·안전성을 보장하지 않습니다. 시술 결정은 전문의 상담 후 하시기 바랍니다.
          </p>

          {/* 개별 후기 — 미니멀 목록 (좋아요만, 댓글/공유 없음). 집계→후기 전환 구분선 1개만 위에. */}
          {reviews.length > 0 && (
            <section className="border-t border-[var(--border)] px-5 py-4">
              <div className={TITLE}>후기 {reviews.length}개</div>
              <ul className="divide-y divide-[var(--border)]">
                {reviews.slice(0, visibleCount).map((card) => (
                  <ReportReviewItem
                    key={card.id}
                    card={card}
                    liked={reviewLiked[card.id] ?? false}
                    me={me}
                    onLoginRequired={(reason) => setAuthPrompt(reason)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* 하단 컨트롤 — 한 줄. 접힘: 카드 펼치기 / 펼침: 후기 더보기(있을 때) + 카드 접기. 구분선 없이 여백만. */}
      <div className="flex items-center justify-center gap-6 bg-white py-3 text-[13px] font-semibold">
        {!expanded ? (
          <button
            type="button"
            onClick={expandCard}
            aria-expanded={false}
            className="flex cursor-pointer items-center gap-1 text-[var(--primary-dark)] transition-colors hover:text-[var(--primary)]"
          >
            더보기
            <span aria-hidden>▾</span>
          </button>
        ) : (
          <>
            {reviews.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + 10)}
                className="cursor-pointer text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
              >
                더보기
              </button>
            )}
            <button
              type="button"
              onClick={collapseCard}
              aria-expanded={true}
              className="flex cursor-pointer items-center gap-1 text-[var(--primary-dark)] transition-colors hover:text-[var(--primary)]"
            >
              접기
              <span aria-hidden>▴</span>
            </button>
          </>
        )}
      </div>

      {/* 비로그인 상태에서 후기 좋아요 시도 시 — Card.tsx 와 동일 패턴 */}
      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </article>
  );
}
